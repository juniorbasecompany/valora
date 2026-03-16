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

## Estrutura inicial

- `pyproject.toml`: dependências e configuração do projeto Python.
- `src/cleber_backend/`: pacote da aplicação.
