#!/usr/bin/env python3
"""
Validação E.1 (plano fase 1): confere tabelas tenant/account/member, PKs, FKs,
ON DELETE/UPDATE, CHECKs e índice único parcial em member.

Uso (na pasta backend, com dependências instaladas e Postgres acessível):

    python script_validate_schema_phase1.py

Exit code 0 se tudo passar; 1 se falhar.
"""

from __future__ import annotations

import sys

from sqlalchemy import create_engine, text


def _fail(msg: str) -> None:
    print(f"ERRO: {msg}", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    from valora_backend.config import Settings

    settings = Settings()
    engine = create_engine(settings.database_url)

    with engine.connect() as conn:
        tables = {
            row[0]
            for row in conn.execute(
                text(
                    "SELECT tablename FROM pg_tables "
                    "WHERE schemaname = 'public' AND tablename IN ('tenant', 'account', 'member')"
                )
            )
        }
        if tables != {"tenant", "account", "member"}:
            _fail(f"tabelas esperadas tenant, account, member; obtido {tables!r}")

        for t in ("tenant", "account", "member"):
            n = conn.execute(
                text(
                    "SELECT count(*) FROM pg_constraint "
                    "WHERE conrelid = CAST(:reg AS regclass) AND contype = 'p'"
                ),
                {"reg": f"public.{t}"},
            ).scalar_one()
            if n != 1:
                _fail(f"tabela {t!r} deve ter exatamente uma PK (encontrado {n})")

        rows = conn.execute(
            text(
                """
                SELECT conname, pg_get_constraintdef(c.oid) AS defn
                FROM pg_constraint c
                JOIN pg_class cl ON c.conrelid = cl.oid
                WHERE cl.relname = 'member' AND c.contype = 'f'
                ORDER BY conname
                """
            )
        ).fetchall()
        by_name = {r[0]: r[1] for r in rows}
        if "member_tenant_id_fkey" not in by_name:
            _fail("FK member_tenant_id_fkey em falta")
        if "member_account_id_fkey" not in by_name:
            _fail("FK member_account_id_fkey em falta")
        t_def = by_name["member_tenant_id_fkey"].upper()
        a_def = by_name["member_account_id_fkey"].upper()
        if "ON DELETE RESTRICT" not in t_def or "ON UPDATE CASCADE" not in t_def:
            _fail(f"member.tenant_id FK inesperada: {by_name['member_tenant_id_fkey']!r}")
        if "ON DELETE SET NULL" not in a_def or "ON UPDATE CASCADE" not in a_def:
            _fail(f"member.account_id FK inesperada: {by_name['member_account_id_fkey']!r}")

        chk = {
            row[0]
            for row in conn.execute(
                text(
                    """
                    SELECT conname FROM pg_constraint
                    WHERE conrelid = 'member'::regclass AND contype = 'c'
                    """
                )
            )
        }
        need_chk = {
            "member_status_chk",
        }
        if chk != need_chk:
            _fail(f"CHECKs em member: esperado {need_chk!r}, obtido {chk!r}")

        idx = conn.execute(
            text(
                """
                SELECT indexdef FROM pg_indexes
                WHERE schemaname = 'public' AND tablename = 'member'
                  AND indexname = 'member_unique_tenant_account'
                """
            )
        ).fetchone()
        if idx is None:
            _fail("índice member_unique_tenant_account em falta")
        if "UNIQUE" not in idx[0] or "account_id IS NOT NULL" not in idx[0]:
            _fail(f"índice parcial inesperado: {idx[0]!r}")

    print("Validação E.1 OK: tenant, account, member; PKs; FKs; CHECKs; índice único parcial.")


if __name__ == "__main__":
    main()
