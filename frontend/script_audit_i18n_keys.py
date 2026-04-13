#!/usr/bin/env python3
"""
Auditoria e sincronização de chaves next-intl (frontend/messages vs frontend/src).

  python script_audit_i18n_keys.py              # relatório
  python script_audit_i18n_keys.py --strict      # exit 1 se faltar chave ou sobrar órfã
  python script_audit_i18n_keys.py --write     # reescreve pt-BR, en-US, es-ES alinhados
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

FRONTEND_ROOT = Path(__file__).resolve().parent
SRC = FRONTEND_ROOT / "src"
MESSAGES = FRONTEND_ROOT / "messages"

ASSIGN_RE = re.compile(
    r"(?:const|let)\s+(\w+)\s*=\s*(?:await\s+)?(?:getTranslations|useTranslations)\(\s*"
    r"['\"]([^'\"]+)['\"]\s*\)",
    re.MULTILINE,
)

# t("key") — primeiro argumento string
T_LITERAL_RE = re.compile(
    r"\b([a-zA-Z_]\w*)\(\s*['\"]([^'\"]+)['\"]",
)

# t.raw("key")
T_RAW_RE = re.compile(
    r"\b(\w+)\.raw\(\s*['\"]([^'\"]+)['\"]",
)

T_TERNARY_RE = re.compile(
    r"\b([a-zA-Z_]\w*)\(\s*[^?]+\?\s*['\"]([^'\"]+)['\"]\s*:\s*['\"]([^'\"]+)['\"]",
)

T_DYNAMIC_RE = re.compile(r"\b([a-zA-Z_]\w*)\(\s*[`$]")

IGNORE_FILE_PARTS = (".test.", ".spec.")

# Chaves usadas via variável ou template literal (não aparecem como t("...") estático).
EXTRA_KEYS: set[str] = {
    # action-configuration-client: tActionPage(`formulas.validationError.${error.code}`)
    "ActionConfigurationPage.formulas.validationError.formula_invalid_assignment",
    "ActionConfigurationPage.formulas.validationError.formula_invalid_target",
    "ActionConfigurationPage.formulas.validationError.formula_unknown_field_id",
    "ActionConfigurationPage.formulas.validationError.formula_expression_invalid",
    "ActionConfigurationPage.formulas.validationError.whichFormula",
    # configuration-history-panel: t(srKey) com srKey em srInsertedValue | srDeletedValue
    "AuditHistory.srInsertedValue",
    "AuditHistory.srDeletedValue",
    # resolveApiErrorUserMessage: tError(relativeKey) com code da API error.db.*
    "error.db.foreign_key_result_references_formula",
    "error.db.foreign_key_violation",
}


def flatten_messages(obj: object, prefix: str = "") -> set[str]:
    keys: set[str] = set()
    if isinstance(obj, dict):
        for k, v in obj.items():
            path = f"{prefix}.{k}" if prefix else str(k)
            if isinstance(v, dict):
                keys |= flatten_messages(v, path)
            else:
                keys.add(path)
    return keys


def unflatten(flat: dict[str, str | dict]) -> dict:
    """Reconstrói objeto aninhado a partir de chaves com pontos (apenas folhas string)."""
    root: dict = {}
    for key, val in flat.items():
        parts = key.split(".")
        d = root
        for p in parts[:-1]:
            d = d.setdefault(p, {})
        d[parts[-1]] = val
    return root


def get_nested(obj: object, path: str) -> object | None:
    cur: object = obj
    for p in path.split("."):
        if not isinstance(cur, dict) or p not in cur:
            return None
        cur = cur[p]
    return cur


def extract_from_file(path: Path) -> tuple[set[str], list[str]]:
    text = path.read_text(encoding="utf-8")
    warnings: list[str] = []

    var_to_ns: dict[str, str] = {}
    for m in ASSIGN_RE.finditer(text):
        var_to_ns[m.group(1)] = m.group(2)

    keys: set[str] = set()

    for m in T_LITERAL_RE.finditer(text):
        var, rel = m.group(1), m.group(2)
        if var not in var_to_ns:
            continue
        keys.add(f"{var_to_ns[var]}.{rel}")

    for m in T_RAW_RE.finditer(text):
        var, rel = m.group(1), m.group(2)
        if var not in var_to_ns:
            continue
        keys.add(f"{var_to_ns[var]}.{rel}")

    for m in T_TERNARY_RE.finditer(text):
        var = m.group(1)
        if var not in var_to_ns:
            continue
        for i in (2, 3):
            keys.add(f"{var_to_ns[var]}.{m.group(i)}")

    for m in T_DYNAMIC_RE.finditer(text):
        var = m.group(1)
        if var in var_to_ns:
            line_no = text[: m.start()].count("\n") + 1
            warnings.append(f"{path.relative_to(FRONTEND_ROOT)}:{line_no} {var}(...) possivelmente dinâmico")

    return keys, warnings


def scan_code() -> tuple[set[str], list[str]]:
    all_keys: set[str] = set()
    all_warnings: list[str] = []
    for path in sorted(SRC.rglob("*.ts")) + sorted(SRC.rglob("*.tsx")):
        if any(p in path.name for p in IGNORE_FILE_PARTS):
            continue
        k, w = extract_from_file(path)
        all_keys |= k
        all_warnings.extend(w)
    return all_keys, all_warnings


def get_required_keys() -> set[str]:
    code_keys, _ = scan_code()
    return code_keys | EXTRA_KEYS


def prune_tree(obj: object, required: set[str], prefix: str = "") -> object | None:
    """Remove folhas cujo caminho não está em required; remove ramos vazios."""
    if isinstance(obj, dict):
        out: dict = {}
        for k, v in obj.items():
            p = f"{prefix}.{k}" if prefix else k
            if isinstance(v, dict):
                sub = prune_tree(v, required, p)
                if sub is not None and sub != {}:
                    out[k] = sub
            else:
                if p in required:
                    out[k] = v
        return out if out else None
    return obj


def merge_leaf_strings(template: dict, donor: dict) -> dict:
    """Mantém a estrutura de template; em cada folha string usa donor[path] se existir, senão template."""
    if isinstance(template, dict):
        out: dict = {}
        for k, v in template.items():
            if isinstance(v, dict):
                sub_donor = donor.get(k) if isinstance(donor, dict) else {}
                out[k] = merge_leaf_strings(v, sub_donor if isinstance(sub_donor, dict) else {})
            else:
                if isinstance(donor, dict) and k in donor and isinstance(donor[k], str):
                    out[k] = donor[k]
                else:
                    out[k] = v
        return out
    return template


def sync_locale_files(required: set[str]) -> None:
    locales = ("en-US", "pt-BR", "es-ES")
    data: dict[str, dict] = {}
    for loc in locales:
        path = MESSAGES / f"{loc}.json"
        data[loc] = json.loads(path.read_text(encoding="utf-8"))

    pruned_en = prune_tree(data["en-US"], required)
    if not isinstance(pruned_en, dict):
        raise SystemExit("prune en-US falhou")
    for loc in ("pt-BR", "es-ES"):
        merged = merge_leaf_strings(pruned_en, data[loc])
        path = MESSAGES / f"{loc}.json"
        path.write_text(
            json.dumps(merged, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    path_en = MESSAGES / "en-US.json"
    path_en.write_text(
        json.dumps(pruned_en, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def load_locale_keys(name: str) -> set[str]:
    path = MESSAGES / f"{name}.json"
    blob = json.loads(path.read_text(encoding="utf-8"))
    return flatten_messages(blob)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--strict", action="store_true")
    parser.add_argument(
        "--write",
        action="store_true",
        help="Reescreve os 3 JSON com as mesmas chaves (valores pt/es preservados onde existirem)",
    )
    args = parser.parse_args()

    code_keys, warnings = scan_code()
    required = code_keys | EXTRA_KEYS

    locales = ("en-US", "pt-BR", "es-ES")
    json_keys = {loc: load_locale_keys(loc) for loc in locales}

    missing_any: set[str] = set()
    orphans_any: set[str] = set()

    for loc in locales:
        miss = required - json_keys[loc]
        orphan = json_keys[loc] - required
        missing_any |= miss
        orphans_any |= orphan
        print(f"=== {loc} ===")
        print(f"  chaves requeridas (código+extras): {len(required)}")
        print(f"  chaves no JSON:  {len(json_keys[loc])}")
        print(f"  em falta no JSON: {len(miss)}")
        print(f"  órfãs no JSON:    {len(orphan)}")
        if miss:
            for k in sorted(miss)[:40]:
                print(f"    MISSING {k}")
            if len(miss) > 40:
                print(f"    ... e mais {len(miss) - 40}")
        if orphan:
            for k in sorted(orphan)[:40]:
                print(f"    ORPHAN {k}")
            if len(orphan) > 40:
                print(f"    ... e mais {len(orphan) - 40}")

    pair_mismatch = []
    for i, a in enumerate(locales):
        for b in locales[i + 1 :]:
            d = json_keys[a].symmetric_difference(json_keys[b])
            if d:
                pair_mismatch.append((a, b, d))

    print("\n=== Paridade entre locales ===")
    if not pair_mismatch:
        print("  Os três ficheiros têm o mesmo conjunto de chaves.")
    else:
        for a, b, d in pair_mismatch:
            print(f"  {a} vs {b}: {len(d)} chaves diferentes")

    if warnings:
        print("\n=== Avisos (revisão manual) ===")
        for w in warnings[:40]:
            print(w)
        if len(warnings) > 40:
            print(f"... e mais {len(warnings) - 40} avisos")

    if args.write:
        print("\n--write: a reescrever messages/*.json ...")
        sync_locale_files(required)
        print("Concluído. Volte a executar sem --write para validar.")
        json_keys2 = {loc: load_locale_keys(loc) for loc in locales}
        for loc in locales:
            miss = required - json_keys2[loc]
            orphan = json_keys2[loc] - required
            if miss or orphan:
                print(f"ERRO pós-write {loc}: missing={len(miss)} orphan={len(orphan)}")
                return 1
        pm = []
        for i, a in enumerate(locales):
            for b in locales[i + 1 :]:
                if json_keys2[a] != json_keys2[b]:
                    pm.append((a, b))
        if pm:
            print("ERRO: paridade ainda quebrada após write")
            return 1
        print("Validação pós-write: OK (chaves idênticas e alinhadas ao requerido).")

    if args.strict:
        if missing_any or orphans_any or pair_mismatch:
            if not args.write:
                return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
