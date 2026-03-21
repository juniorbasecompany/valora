---
name: stack
description: Stack oficial de frontend e backend (Next.js, React, TypeScript, Tailwind; FastAPI, SQLAlchemy, Alembic, PostgreSQL). Use em implementação ou revisão de código que toque em front, API ou dependências de runtime.
---

# Stack de implementação

## Objetivo

Aplicar o stack acordado em [architecture/technology-stack.md](../../../architecture/technology-stack.md) em qualquer tarefa de implementação ou revisão do `frontend/` e do `backend/`.

## Quando usar

- Criar ou alterar código no frontend ou no backend.
- Propor novas dependências de runtime ou ferramentas de build.
- Rever PR ou diff que introduza tecnologia paralela (outro framework, outro ORM, etc.).

## Regras

### Frontend

- **Next.js**, **React**, **TypeScript**, **Tailwind CSS**.
- Quando existir `eslint` / `eslint-config-next` no `package.json`, seguir a configuração do projeto.

### Backend

- **FastAPI**, **SQLAlchemy**, **Alembic**, **PostgreSQL**, **Pydantic**, **Uvicorn** (e o que já estiver declarado em `backend/pyproject.toml`).
- Não propor **SQLModel** como ORM principal nem substituir SQLAlchemy por outro ORM sem mudança explícita em [architecture/technology-stack.md](../../../architecture/technology-stack.md) e nesta skill.

### Proibições

- Não introduzir outro framework de UI (por exemplo Vue, Svelte, Angular) nem outro ORM “por conveniência” sem actualizar a documentação canónica acima.
- Não duplicar lista de versões pinadas em Markdown; usar [frontend/package.json](../../../frontend/package.json) e [backend/pyproject.toml](../../../backend/pyproject.toml) como fonte.

## Referências

- [architecture/technology-stack.md](../../../architecture/technology-stack.md)
- [frontend/package.json](../../../frontend/package.json)
- [backend/pyproject.toml](../../../backend/pyproject.toml)
