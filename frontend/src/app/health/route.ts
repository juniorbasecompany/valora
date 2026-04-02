import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const internalBackendUrl =
  process.env.INTERNAL_BACKEND_URL || "http://127.0.0.1:8003";

/**
 * Healthcheck do PaaS bate na PORT do Next; o FastAPI sobe em paralelo e pode atrasar alguns ms.
 * Espera o backend responder antes de falhar, para o Railway não marcar o replica como unhealthy.
 */
export async function GET() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${internalBackendUrl}/health`, {
        cache: "no-store",
        signal: AbortSignal.timeout(5000)
      });
      if (response.ok) {
        const body = await response.text();
        return new NextResponse(body, {
          status: 200,
          headers: {
            "content-type":
              response.headers.get("content-type") || "application/json"
          }
        });
      }
    } catch {
      /* backend ainda a subir */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return NextResponse.json(
    { detail: "Service unavailable" },
    { status: 503 }
  );
}
