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

```bash
docker compose up -d
```

Isso sobe o Postgres com o banco **valora**, usuário `valora`, senha `dev` e porta `5432`.

### Variáveis de ambiente

O backend e o Alembic leem a URL do banco em `DATABASE_URL`. Se não estiver definida, usam o valor padrão compatível com o Compose local:

- Host: `localhost`
- Porta: `5432`
- Banco: `valora`
- Usuário: `valora`
- Senha: `dev`

Para sobrescrever (por exemplo em outro ambiente), copie `backend/.env.example` para `backend/.env` e ajuste conforme necessário. O arquivo `.env` está no `.gitignore` e não deve conter credenciais de produção.

### Migrations (quando configurado)

Com o Postgres rodando e o banco acessível:

```bash
cd backend
alembic upgrade head
```

## Estrutura inicial

- `pyproject.toml`: dependências e configuração do projeto Python.
- `src/valora_backend/`: pacote da aplicação.
- `src/valora_backend/config.py`: configuração via `pydantic-settings` (ex.: `DATABASE_URL`).
