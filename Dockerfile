# Imagem de produção do backend a partir da raiz do monorepo.
# O Railway usa este ficheiro quando o contexto de build é a raiz do repositório
# (evita depender só do Railpack, que não deteta Python fora de backend/).

FROM python:3.12-slim-bookworm

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

COPY backend/pyproject.toml backend/README.md ./
COPY backend/src ./src
COPY backend/alembic.ini ./
COPY backend/alembic ./alembic

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN pip install --upgrade pip && pip install .

EXPOSE 8000

# Aplica schema antes do servidor (Railway: mesmo DATABASE_URL / PG* do runtime).
CMD ["sh", "-c", "python -m alembic upgrade head && exec uvicorn valora_backend.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
