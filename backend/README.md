## backend

Serviço **FastAPI** do Valora: API HTTP, persistência em **PostgreSQL** (SQLAlchemy + Alembic), autenticação Google e JWT da aplicação.

### Modelo relacional (`erd.json`)

A fonte de verdade do diagrama entidade-relacionamento (JSON drawDB) é [`erd.json`](erd.json). Tabelas previstas no diagrama alinhadas à implementação atual:

| Tabela    | Módulo ORM | Notas |
|-----------|------------|--------|
| `tenant`  | [`model/identity.py`](src/valora_backend/model/identity.py) | Licenciado. |
| `account` | idem | Conta de autenticação; unicidade de `email` e de `(provider, provider_subject)`. |
| `member`  | idem | Vínculo conta ↔ tenant; papel, status, `current_scope_id`. |
| `scope`   | idem | Escopo operacional por tenant. |
| `location`| idem | Hierarquia por escopo (`parent_location_id`, `sort_order`). |
| `item`    | idem | Hierarquia por escopo (`parent_item_id`, `sort_order`). |
| `unity`   | idem | Unidade alocada (lote) por local; referencia `item_id_list` do catálogo no escopo. |
| `log`     | [`model/log.py`](src/valora_backend/model/log.py) | Auditoria (`table_name`, `action_type`, `row_id`, `row`, `moment_utc`). |
| `field`   | [`model/rules.py`](src/valora_backend/model/rules.py) | Definição de campo por escopo; coluna SQL `type` e flags `is_initial_age` / `is_current_age` / `is_final_age` para marcar os campos de idade do lote. |
| `action`  | idem | Ação por escopo, com `sort_order` e flag `is_recurrent` para distinguir efeitos pontuais de efeitos recorrentes. |
| `formula` | idem | Passos de fórmula por ação (`step`, `statement`). |
| `label`   | idem | Rótulo i18n ligado a `field` **ou** `action`. |
| `event`   | idem | Evento operacional (`location_id`, `item_id`, `action_id`, `moment_utc`). |
| `input`   | idem | Entrada por evento e campo. |
| `result`  | idem | Resultado por evento e campo, com valor tipado em `text_value`, `boolean_value` ou `numeric_value`, além de rastreio da fórmula via `formula_id` e `formula_order`. |

Convenções e extensões do JSON (por exemplo `constraints`, `nullIfEmpty` em campos) estão descritas na skill [`.cursor/skills/export-erd-drawdb/SKILL.md`](../.cursor/skills/export-erd-drawdb/SKILL.md).

### Variáveis de ambiente

```bash
POSTGRES_PASSWORD=
GOOGLE_CLIENT_ID=
APP_JWT_SECRET=
```

Opcional em deploy: `DATABASE_URL` ou `VALORA_DATABASE_URL` (ver [`config.py`](src/valora_backend/config.py)).

Opcional, tradução assistida de rótulos de field (DeepL): `DEEPL_API_KEY` (chaves **Free** terminam em `:fx` e usam `https://api-free.deepl.com`; chaves **Pro** usam `https://api.deepl.com`). Se `DEEPL_API_BASE_URL` não bater com o tipo de chave, a API responde **403**: o backend corrige o host automaticamente quando detecta mismatch. A autenticação é o header `Authorization: DeepL-Auth-Key …` (não usar `auth_key` no corpo). As traduções automáticas enviam **`source_lang`** e **`target_lang`** (origem = `label_lang`; códigos de origem na API: `PT` / `EN` / `ES`; destino: `PT-BR` / `EN-US` / `ES`). Ver [`deepl_label_translation.py`](src/valora_backend/services/deepl_label_translation.py).

### Autenticação e sessão

O backend valida o `id_token` do Google, encontra ou cria `account`, reconcilia `member` pendente por email e emite JWT da aplicação com `account_id` e `tenant_id`. O middleware de auditoria preenche contexto de transação para triggers que gravam em `log`.

### API (visão geral)

Rotas públicas de saúde: `GET /health`, `GET /health/db`.

Documentação interativa OpenAPI: ao subir o servidor, **`/docs`** (Swagger).

**Autenticação e tenant atual** — prefixo `/auth` ([`api/auth.py`](src/valora_backend/api/auth.py)):

- `POST /auth/google`, `POST /auth/google/select-tenant`, `POST /auth/google/create-tenant`, `POST /auth/switch-tenant`
- `GET /auth/tenant/list`, `GET /auth/me`
- `GET /auth/tenant/current`, `PATCH /auth/tenant/current`, `DELETE /auth/tenant/current`
- `GET /auth/tenant/current/members`, `POST /auth/tenant/current/members`, `PATCH /auth/tenant/current/members/{member_id}`, `DELETE /auth/tenant/current/members/{member_id}`
- `POST /auth/tenant/current/members/{member_id}/invite`
- `GET /auth/tenant/current/scopes`, `POST /auth/tenant/current/scopes`, `PATCH /auth/tenant/current/scopes/{scope_id}`, `DELETE /auth/tenant/current/scopes/{scope_id}`
- `GET /auth/tenant/current/scopes/{scope_id}/locations` (+ `POST`, `PATCH`, `DELETE`, `POST .../move`)
- `GET /auth/tenant/current/scopes/{scope_id}/items` (+ `POST`, `PATCH`, `DELETE`, `POST .../move`)
- `GET /auth/tenant/current/scopes/{scope_id}/unities` (+ `POST`, `PATCH`, `DELETE`)
- `GET /auth/tenant/current/logs/{table_name}` (histórico a partir de `log`)
- `PATCH /auth/me/current-scope`
- `POST /auth/invites/{member_id}/accept`, `POST /auth/invites/{member_id}/reject`

**Regras por escopo** (campos, ações, fórmulas, rótulos, eventos, entradas, resultados) — prefixo `/auth/tenant/current` ([`api/rules.py`](src/valora_backend/api/rules.py)), sempre sob um `scope_id` do tenant atual:

- `.../scopes/{scope_id}/fields` e `.../fields/{field_id}`
- `.../scopes/{scope_id}/actions` e `.../actions/{action_id}` (`action` expõe `is_recurrent`; em `POST`/`PATCH`, a flag define se o efeito da ação se estende do evento até o próximo evento da mesma ação ou até a idade final)
- `.../actions/{action_id}/formulas` e `.../formulas/{formula_id}` (em `POST`/`PATCH`, a `statement` é validada com contrato de atribuição: exatamente um operador `=` de atribuição, `LHS` obrigatório `${field:id}` e `RHS` com `${field:id}` e `${input:id}`; todas as referências devem existir no escopo e a `RHS` passa por dry-run com [simpleeval](https://pypi.org/project/simpleeval/). Códigos 422 estáveis: `formula_invalid_assignment`, `formula_invalid_target`, `formula_unknown_field_id`, `formula_expression_invalid`, com `step` no detalhe quando disponível. Implementação em `valora_backend/rules/`; para reproduzir no terminal: `PYTHONPATH=src python script_try_formula_validate.py 1,2 '"${field:1} = …"' …`.)
- `.../scopes/{scope_id}/labels` e `.../labels/{label_id}` (filtros opcionais `field_id` / `action_id` na listagem)
- `.../scopes/{scope_id}/events` e `.../events/{event_id}`
- `POST .../scopes/{scope_id}/events/calculate-current-age` (executa as fórmulas dos eventos no período informado, persiste `result` com `formula_id` e `formula_order`, e usa os campos marcados como `is_initial_age`, `is_current_age` e `is_final_age` para controlar a janela de cálculo; a ordem oficial é cronológica por `DATE(event.moment_utc)` e, quando houver mais de um evento no mesmo dia, por `action.sort_order`, com desempate por `event.moment_utc`, `event.id`, `formula.sort_order` e `result.id`)
- `.../events/{event_id}/inputs` e `.../inputs/{input_id}`
- `.../events/{event_id}/results` e `.../results/{result_id}` (`result` segue o ERD atual: `text_value`, `boolean_value`, `numeric_value`, `moment_utc`, `formula_id`, `formula_order`)

Edição das regras por escopo exige papel **master** ou **admin** no `member`; leitura segue o acesso ao tenant.

### Regra global para filtros textuais

- Todo filtro textual de API deve comparar com normalização no banco, ignorando diferença de caixa e acentuação.
- No PostgreSQL, usar padrão com normalização dos dois lados da comparação:
  - `lower(unaccent(coluna)) = lower(unaccent(parametro))`
  - `lower(unaccent(coluna)) LIKE '%' || lower(unaccent(parametro)) || '%'`
- O mesmo comportamento deve ser mantido nos testes automatizados para evitar divergência entre ambiente de teste e produção.

---

## Objetivo desta pasta

Concentra a API, a regra de aplicação, a integração com PostgreSQL e a evolução do motor oficial do sistema.

## Isolamento de dependência

As dependências do backend devem ser instaladas apenas nesta pasta, com ambiente virtual próprio.

Exemplo com `uv`:

```bash
uv venv .venv
uv sync
```

Para subir a API localmente (com dependências instaladas):

```bash
uv run uvicorn valora_backend.main:app --reload --port 8003
```

Se o comando `uv` não for reconhecido no PowerShell (CLI do `uv` ausente ou fora do `PATH`), use o interpretador do ambiente virtual do próprio `backend`, que já inclui o `uvicorn` após `uv sync` ou `pip install -e .`:

```powershell
.\.venv\Scripts\python.exe -m uvicorn valora_backend.main:app --reload --port 8003
```

## Banco de dados (desenvolvimento)

O PostgreSQL de desenvolvimento roda em **Docker Compose**. Na raiz do repositório:

1. Copie [`.env.example`](../.env.example) para `.env` na raiz e defina **`POSTGRES_PASSWORD`**, **`GOOGLE_CLIENT_ID`** e **`APP_JWT_SECRET`**.
2. Suba o serviço:

```bash
docker compose up -d
```

Isso sobe o Postgres com o banco **valora**, utilizador `valora` e porta **5434** no host (mapeada para 5432 no container). A senha é apenas a que estiver em `POSTGRES_PASSWORD` no `.env` da raiz.

### Variáveis de ambiente (detalhe)

- **`POSTGRES_PASSWORD`** (obrigatória para o backend e para o Compose): defina-a no arquivo **`.env` na raiz do monorepo** (copiado de `.env.example`). O mesmo arquivo é lido pelo Docker Compose e por [`config.py`](src/valora_backend/config.py), que monta a URL do PostgreSQL (`database_url`) com host `localhost`, porta `5434`, utilizador `valora` e base `valora`.
- **`GOOGLE_CLIENT_ID`** (obrigatória para login Google): usada pelo backend para validar o `id_token` enviado pelo frontend.
- **`APP_JWT_SECRET`** (obrigatória para sessão da aplicação): usada pelo backend para assinar o JWT próprio da aplicação. Não deixe o ambiente cair no valor padrão de desenvolvimento.

Arquivos `.env` estão no `.gitignore` e não devem ser commitados.

**Quem já tinha o Postgres a correr com outra senha:** mantenha no novo `.env` a **mesma** `POSTGRES_PASSWORD` que o volume Docker já usa, ou altere a senha no servidor (`ALTER USER …`) para coincidir com o valor novo no `.env`.

### Migrations (Alembic)

Com o Postgres acessível e **`POSTGRES_PASSWORD`** definida (`.env` na raiz, lido também pelo Alembic via `Settings`):

```bash
cd backend
python -m alembic upgrade head
```

- Configuração: [`alembic.ini`](alembic.ini) (URL placeholder; a URL real vem de [`alembic/env.py`](alembic/env.py)).
- Revisões: pasta [`alembic/versions/`](alembic/versions/).

Para gerar uma nova revisão após alterar modelos:

```bash
cd backend
python -m alembic revision --autogenerate -m "descrição"
```

### Validação parcial do schema (fase 1 — E.1)

O script [`script_validate_schema_phase1.py`](script_validate_schema_phase1.py) **não** valida o schema completo do repositório: ele confere apenas as tabelas **`tenant`**, **`account`**, **`member`**, PKs, FKs (incluindo `ON DELETE` / `UPDATE`), `CHECK`s e o índice único parcial em `member`. Útil como verificação mínima de identidade; o restante do modelo segue `erd.json`, modelos SQLAlchemy e migrações.

Com o Postgres acessível e migrations aplicadas, na pasta `backend`:

```bash
python script_validate_schema_phase1.py
```

Exit code `0` se passar.

### Testes de triggers de auditoria (`log`)

Com Postgres acessível e `alembic upgrade head` aplicado, na pasta `backend`:

```bash
python -m pytest tests/test_audit_triggers_pg.py -q
```

Se a URL atual não for PostgreSQL ou o banco estiver indisponível, os testes são ignorados.

Política atual de auditoria:

- `member`, `scope`, `location` e `item` exigem `tenant_id` e `account_id` no contexto da transação; sem isso, a trigger falha.
- `tenant` exige `account_id`; `tenant_id` em `INSERT` continua como exceção temporária.
- `account` permite `tenant_id` ausente; `account_id` em `INSERT` continua como exceção temporária.
- `log.account_id` e `log.tenant_id` preservam IDs históricos e não são mais reescritos por FK ao apagar `account` ou `tenant`.

### Sessão e infraestrutura da API

- [`src/valora_backend/db.py`](src/valora_backend/db.py): `engine`, `SessionLocal`, dependency `get_session` (injeta `Request` e, no PostgreSQL, aplica `set_config` local para auditoria após `after_begin`) e alias `SessionDep`.
- [`src/valora_backend/middleware/audit_request_context.py`](src/valora_backend/middleware/audit_request_context.py): preenche `request.state` com `tenant_id` e `account_id` a partir do JWT válido.
- [`src/valora_backend/main.py`](src/valora_backend/main.py): montagem da app, handlers de erro de integridade / DB e routers.

## Estrutura do pacote

- `pyproject.toml`: dependências e configuração do projeto Python.
- `src/valora_backend/config.py`: configuração via `pydantic-settings`.
- `src/valora_backend/model/`: metadados SQLAlchemy — [`identity.py`](src/valora_backend/model/identity.py) (`tenant`, `account`, `member`, `scope`, `location`, `item`), [`log.py`](src/valora_backend/model/log.py) (`log`), [`rules.py`](src/valora_backend/model/rules.py) (`field`, `action`, `formula`, `label`, `event`, `input`, `result`); [`__init__.py`](src/valora_backend/model/__init__.py) importa tudo para o Alembic.
- `src/valora_backend/api/`: [`auth.py`](src/valora_backend/api/auth.py), [`rules.py`](src/valora_backend/api/rules.py).
- `alembic/`: migrations; `env.py` usa `Base.metadata` e a mesma URL que o backend.
- `erd.json`: ERD drawDB (fonte de verdade do diagrama).
- `script_validate_schema_phase1.py`: checagem automática mínima do subconjunto identidade (E.1).
