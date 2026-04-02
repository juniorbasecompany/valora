import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Liveness do PaaS: resposta imediata 200.
 * O probe do Railway tem timeout curto; não pode depender de fetch ao FastAPI (risco de 503 em cadeia).
 * Para verificar API: GET direto no Uvicorn em 127.0.0.1:8003/health dentro do container ou métricas à parte.
 */
export async function GET() {
  return NextResponse.json({ status: "ok" }, { status: 200 });
}
