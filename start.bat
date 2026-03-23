@echo off
REM Portas padrao de desenvolvimento: frontend 3003 e backend 8003.
REM Em frontend/.env.local defina NEXT_PUBLIC_API_URL=http://127.0.0.1:8003 (ou localhost).
REM Apos alterar .env.local, reinicie o npm run dev.
cd /d "%~dp0"
docker compose up -d --wait
cd backend
start /B "" .\.venv\Scripts\python.exe -m uvicorn valora_backend.main:app --reload --port 8003
cd ..\frontend
npm run dev
