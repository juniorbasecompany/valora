# Imagem única (monorepo): FastAPI + Next.js na mesma imagem, orquestrados por supervisord.
# O processo público na PORT é o Next; liveness em GET /health (rota Next, ver frontend/src/app/health/route.ts).
# Build: definir NEXT_PUBLIC_* no Railway (ou Docker build-arg) para o passo npm run build.

# syntax=docker/dockerfile:1
FROM node:22-bookworm AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# Next aceita public vazio; o repositório pode não ter a pasta.
RUN mkdir -p public
ARG NEXT_PUBLIC_API_URL=http://127.0.0.1:8003
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build && npm prune --omit=dev

FROM python:3.12-slim-bookworm

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    supervisor \
    && rm -rf /var/lib/apt/lists/*

COPY --from=node:22-bookworm /usr/local /usr/local

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

COPY backend/pyproject.toml backend/README.md ./
COPY backend/src ./src
COPY backend/alembic.ini ./
COPY backend/alembic ./alembic

RUN pip install --upgrade pip && pip install .

COPY --from=frontend-build /app/frontend/.next ./frontend/.next
COPY --from=frontend-build /app/frontend/public ./frontend/public
COPY --from=frontend-build /app/frontend/package.json ./frontend/package.json
COPY --from=frontend-build /app/frontend/node_modules ./frontend/node_modules
COPY --from=frontend-build /app/frontend/next.config.ts ./frontend/next.config.ts
COPY --from=frontend-build /app/frontend/tsconfig.json ./frontend/tsconfig.json
COPY --from=frontend-build /app/frontend/src ./frontend/src
COPY --from=frontend-build /app/frontend/messages ./frontend/messages

COPY deploy/valora-supervisor.conf /etc/supervisor/conf.d/valora.conf
COPY deploy/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 8080

ENTRYPOINT ["/app/docker-entrypoint.sh"]
