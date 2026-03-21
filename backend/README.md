## backend

Serviço FastAPI do Valora.

## Autenticação Google

O backend valida o `id_token` do Google, encontra ou cria `account`, reconcilia `member` pendente por email e emite um JWT próprio da aplicação com `account_id` e `tenant_id`.

## Variáveis de ambiente

```bash
POSTGRES_PASSWORD=
GOOGLE_CLIENT_ID=
APP_JWT_SECRET=
```

## Fluxos implementados

- `POST /auth/google`
- `POST /auth/google/select-tenant`
- `POST /auth/google/create-tenant`
- `POST /auth/switch-tenant`
- `GET /auth/tenant/list`
- `GET /auth/me`
- `POST /auth/invites/{member_id}/accept`
- `POST /auth/invites/{member_id}/reject`
# backend

Projeto Python do núcleo executável do sistema.

## Objetivo

Esta pasta concentra a API, a regra de aplicação, a integração com PostgreSQL e a evolução do motor oficial do sistema.

## Isolamento de dependência

As dependências do backend devem ser instaladas apenas nesta pasta, com ambiente virtual próprio.

Exemplo com `uv`:

```bash
uv venv .venv
uv sync
```

Para subir a API localmente (com dependências instaladas):

```bash
uv run uvicorn valora_backend.main:app --reload
```

## Banco de dados (desenvolvimento)

O PostgreSQL de desenvolvimento roda em **Docker Compose**. Na raiz do repositório:

1. Copie [`.env.example`](../.env.example) para `.env` na raiz e defina **`POSTGRES_PASSWORD`** (valor local, não commitado).
2. Suba o serviço:

```bash
docker compose up -d
```

Isso sobe o Postgres com o banco **valora**, utilizador `valora` e porta **5434** no host (mapeada para 5432 no container). A senha é apenas a que estiver em `POSTGRES_PASSWORD` no `.env` da raiz.

### Variáveis de ambiente

- **`POSTGRES_PASSWORD`** (obrigatória para o backend e para o Compose): defina-a no ficheiro **`.env` na raiz do monorepo** (copiado de `.env.example`). O mesmo ficheiro é lido pelo Docker Compose e por [config.py](src/valora_backend/config.py), que monta a URL do PostgreSQL (`database_url`) com host `localhost`, porta `5434`, utilizador `valora` e base `valora`.
- Opcionalmente pode existir um **`backend/.env`** com a mesma variável; a ordem de leitura em `Settings` é `../.env` e depois `.env` na pasta `backend`.

Ficheiros `.env` estão no `.gitignore` e não devem ser commitados.

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

### Validação do schema (fase 1 — E.1)

Com o Postgres acessível e migrations aplicadas, na pasta `backend`:

```bash
python script_validate_schema_phase1.py
```

O script confere as tabelas `tenant`, `account`, `member`, PKs, FKs (incl. `ON DELETE` / `UPDATE`), `CHECK`s e o índice único parcial em `member`. Exit code `0` se passar.

### Sessão e API (fase 1 — E.2)

- [`src/valora_backend/db.py`](src/valora_backend/db.py): `engine`, `SessionLocal`, dependency `get_session` e alias `SessionDep`.
- O endpoint `GET /health/db` usa a sessão para `SELECT 1` e confirma ligação ao banco.

## Estrutura inicial

- `pyproject.toml`: dependências e configuração do projeto Python.
- `src/valora_backend/`: pacote da aplicação.
- `src/valora_backend/config.py`: configuração via `pydantic-settings` (`POSTGRES_PASSWORD` → URL do banco em `database_url`).
- `src/valora_backend/model/`: modelos SQLAlchemy (fase 1: `tenant`, `account`, `member` em `identity.py`).
- `src/valora_backend/db.py`: engine, sessão e dependency FastAPI (`get_session`).
- `alembic/`: migrations; `env.py` usa `Base.metadata` e a mesma URL que o backend.
- `script_validate_schema_phase1.py`: validação automática do schema da fase 1 (E.1).
