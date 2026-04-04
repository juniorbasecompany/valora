#!/usr/bin/env python3
"""
Verifica se o Postgres tem a funcao de auditoria e a constraint em `log` alinhadas ao codigo
(migracao c4e8d1f2a3b5 e cadeia anterior).

Uso (pasta backend, com Settings / DATABASE_URL apontando para o mesmo banco do servico):

    python script_verify_audit_schema.py

Diagnostico de erros genericos na API: quando o backend devolve a mensagem padrao de falha
de BD, o processo do servidor imprime no stderr linhas `VALORA_DB_UNMAPPED`,
`VALORA_STATEMENT_ERROR` ou `VALORA_DB_MAPPED_PG` — reproduza o save e copie essa linha
para identificar a mensagem real do PostgreSQL.

Exit code 0 se passar; 1 se falhar.
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
        row = conn.execute(
            text(
                "SELECT pg_get_functiondef(p.oid) FROM pg_proc p "
                "JOIN pg_namespace n ON p.pronamespace = n.oid "
                "WHERE n.nspname = 'public' AND p.proname = 'valora_audit_row_to_log'"
            )
        ).fetchone()
        if row is None:
            _fail("funcao public.valora_audit_row_to_log nao encontrada (migracoes aplicadas?)")
        src = row[0]
        if "'input'" not in src:
            _fail(
                "corpo da funcao valora_audit_row_to_log deve incluir 'input' na lista de tabelas "
                "(aplique alembic upgrade head)."
            )
        if "'item'" not in src:
            _fail(
                "corpo da funcao valora_audit_row_to_log deve incluir 'item' "
                "(migracao unity->item; aplique alembic upgrade head)."
            )

        chk = conn.execute(
            text(
                """
                SELECT pg_get_constraintdef(c.oid)
                FROM pg_constraint c
                JOIN pg_class cl ON c.conrelid = cl.oid
                WHERE cl.relname = 'log' AND c.conname = 'log_table_name_chk'
                """
            )
        ).fetchone()
        if chk is None:
            _fail("constraint log_table_name_chk na tabela log nao encontrada")
        defn = chk[0].lower()
        if "input" not in defn:
            _fail("log_table_name_chk deve permitir table_name input; def: " + chk[0])
        if "item" not in defn:
            _fail("log_table_name_chk deve permitir table_name item; def: " + chk[0])

    print("OK: valora_audit_row_to_log e log_table_name_chk consistentes com o dominio atual.")


if __name__ == "__main__":
    main()
