import { NextRequest, NextResponse } from "next/server";

import type { TenantLocationDirectoryResponse } from "@/lib/auth/types";
import { backendFetch, requireToken } from "@/lib/backend-fetch";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ scopeId: string; locationId: string }> }
) {
  const authResult = requireToken(request);
  if (!authResult.ok) {
    return authResult.error;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ detail: "Invalid JSON body" }, { status: 400 });
  }

  const { scopeId, locationId } = await context.params;
  const result = await backendFetch<TenantLocationDirectoryResponse>(
    `/auth/tenant/current/scopes/${scopeId}/locations/${locationId}/move`,
    {
      method: "POST",
      token: authResult.token,
      body
    }
  );
  if (!result.ok) {
    return result.error;
  }

  return NextResponse.json(result.data);
}
