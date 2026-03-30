# Stack de tecnologia

Decisão canónica de runtime para o front e o back. **Versões concretas** vivem em `frontend/package.json` e `backend/pyproject.toml`; este documento não as substitui.

## Frontend

- **Next.js**, **React**, **TypeScript**, **Tailwind CSS**.
- **CSS global semântico:** entrada em `frontend/src/app/styles/base.css` (tokens, reset e imports dos demais folhas da mesma pasta).
- **Internacionalização:** ver [skills/implementation/i18n/policy.md](../skills/implementation/i18n/policy.md) e a skill [skills/implementation/i18n/SKILL.md](../skills/implementation/i18n/SKILL.md).

## Backend

- **FastAPI**, **SQLAlchemy**, **Alembic**, **PostgreSQL** (`psycopg`), **Pydantic** (incl. `pydantic-settings` conforme o projeto), servidor ASGI **Uvicorn**.
- **Python**: conforme `requires-python` em `backend/pyproject.toml` (actualmente `>=3.12`).

## Integração

- O cliente web fala com o backend por **API HTTP** (padrão REST/JSON).
- `frontend/` e `backend/` são **projetos separados** no mesmo monorepo, sem misturar dependências.
- **Tradução assistida de rótulos em base de dados** (`label`): serviço externo planejado **DeepL API**; decisão e âmbito em [skills/implementation/i18n/policy.md](../skills/implementation/i18n/policy.md).

## Relação com o resto da arquitectura

- Regras de domínio, auditoria e rastreabilidade continuam em [system-principles.md](system-principles.md) e nas skills; este ficheiro fixa só **quais tecnologias** entram na implementação.
