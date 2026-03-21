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

### Migrations (quando configurado)

Com o Postgres rodando e o banco acessível:

```bash
cd backend
alembic upgrade head
```

## Estrutura inicial

- `pyproject.toml`: dependências e configuração do projeto Python.
- `src/valora_backend/`: pacote da aplicação.
- `src/valora_backend/config.py`: configuração via `pydantic-settings` (`POSTGRES_PASSWORD` → URL do banco em `database_url`).
