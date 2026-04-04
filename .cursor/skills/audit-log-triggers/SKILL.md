---
name: audit-log-triggers
description: Triggers PostgreSQL que gravam em log e contrato SET LOCAL / set_config para tenant_id e account_id. Use ao alterar auditoria, migrações de log, novas tabelas monitorizadas ou integração da API com o contexto de transação.
---

# Auditoria em `log` via triggers PostgreSQL

## Objetivo

As tabelas **`tenant`**, **`account`**, **`member`**, **`scope`**, **`location`** e **`item`** têm triggers `AFTER INSERT OR UPDATE OR DELETE` que inserem uma linha na tabela **`log`**, alinhada ao modelo [`backend/src/valora_backend/model/log.py`](backend/src/valora_backend/model/log.py) e ao CHECK `log_table_name_chk`.

A função PL/pgSQL é **`valora_audit_row_to_log()`** (revisão Alembic que cria triggers: arquivo `*_audit_row_triggers.py` em [`backend/alembic/versions/`](backend/alembic/versions/); coluna `log.row_id` na revisão `d4c8b2a0e1f3_log_row_id_not_null.py`).

## Contrato de contexto (`SET LOCAL` / `set_config`)

Os campos **`log.tenant_id`** e **`log.account_id`** são preenchidos **apenas** a partir de variáveis de sessão **locais à transação**:

| Nome | Papel |
|------|--------|
| `valora.current_tenant_id` | Licenciado ao qual o evento se refere (texto numérico castável a `bigint`) |
| `valora.current_account_id` | Conta que originou o evento (ator; texto numérico castável a `bigint`) |

- Na API, usar **`SELECT set_config('valora.current_tenant_id', :v, true)`** (e o análogo para `account_id`) com o terceiro argumento **`true`** — equivalente a **`SET LOCAL`** no PostgreSQL.
- **Fonte preferida na aplicação:** [`apply_audit_gucs_for_session`](backend/src/valora_backend/audit_request.py) / [`apply_audit_gucs_on_connection`](backend/src/valora_backend/audit_request.py), chamada após resolver o contexto real de negócio:
  - No fim de [`get_current_member`](backend/src/valora_backend/auth/dependencies.py) com `member.tenant_id` e `member.account_id` (cobre a maior parte das rotas autenticadas por tenant).
  - Antes de `commit` em rotas sem `get_current_member` (ex.: convites, fluxos Google em [`auth.py`](backend/src/valora_backend/api/auth.py)) com os IDs adequados por operação.
- **Camada complementar:** o listener `after_begin` em [`db.py`](backend/src/valora_backend/db.py) aplica GUCs a partir de `request.state` (JWT validado no middleware [`audit_request_context.py`](backend/src/valora_backend/middleware/audit_request_context.py)), útil na **primeira** transação antes de existir `Member` carregado; o hook no `get_current_member` **reforça** com dados do ORM quando aplicável.
- Se os settings não estiverem definidos ou o cast falhar, o trigger grava **`NULL`** (FKs nullable). Migrações e jobs sem contexto devem assumir esse comportamento.

## Comportamento do trigger

- **`action_type`**: `I`, `U` ou `D` conforme `TG_OP`.
- **`row_id`**: `BIGINT NOT NULL` — `NEW.id` em `INSERT`/`UPDATE`; `OLD.id` em `DELETE` (identificador da linha na tabela monitorizada).
- **`row`**: JSONB da linha nova (`row_to_json(NEW)::jsonb`) em `I`/`U`; **`NULL`** em `D` (obrigatório pelo CHECK `log_row_payload_by_action_chk`).
- **`table_name`**: `TG_TABLE_NAME` (deve pertencer ao CHECK em `log`).

Runtime suportado: **PostgreSQL 17** (ver Compose na raiz do monorepo).

## Incluir uma nova tabela monitorizada

1. Atualizar o CHECK `log_table_name_chk` em migration + [`log.py`](backend/src/valora_backend/model/log.py) + [`backend/erd.json`](backend/erd.json) (`fields[].check` em `log` e comentários).
2. Na mesma ou nova migration: `CREATE TRIGGER ... AFTER INSERT OR UPDATE OR DELETE ON <tabela> FOR EACH ROW EXECUTE FUNCTION valora_audit_row_to_log();` (nome do trigger: `<tabela>_valora_audit_trg`).
3. **Não** é necessário ramo extra na função para `tenant_id`/`account_id` — só leitura dos GUCs acima.
4. Teste de integração opcional: `VALORA_AUDIT_PG_TEST=1` e Postgres migrado; ver [`backend/tests/test_audit_triggers_pg.py`](backend/tests/test_audit_triggers_pg.py).

## Diagrama ERD

A fonte do diagrama continua em [`backend/erd.json`](backend/erd.json). Ao mudar a lista de tabelas em `log`, alinhar também a skill [**export-erd-drawdb**](../export-erd-drawdb/SKILL.md).
