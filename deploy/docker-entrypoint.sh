#!/bin/sh
set -e
cd /app
echo "VALORA_BOOT starting entrypoint (PORT=${PORT:-unset})"
echo "VALORA_BOOT running alembic upgrade head"
python -m alembic upgrade head
# Dá tempo ao FastAPI antes do Next aceitar /health (rewrite).
sleep 2
echo "VALORA_BOOT starting supervisord"
exec /usr/bin/supervisord -n -c /etc/supervisor/supervisord.conf
