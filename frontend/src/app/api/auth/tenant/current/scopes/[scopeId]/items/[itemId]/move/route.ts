import { NextRequest, NextResponse } from "next/server";

import type { TenantItemDirectoryResponse } from "@/lib/auth/types";
import { backendFetch, requireToken } from "@/lib/backend-fetch";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ scopeId: string; itemId: string }> }
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

  const { scopeId, itemId } = await context.params;
  const result = await backendFetch<TenantItemDirectoryResponse>(
    `/auth/tenant/current/scopes/${scopeId}/items/${itemId}/move`,
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
