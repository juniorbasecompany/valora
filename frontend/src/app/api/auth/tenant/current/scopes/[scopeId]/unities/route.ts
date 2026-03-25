import { NextRequest, NextResponse } from "next/server";

import type { TenantUnityDirectoryResponse } from "@/lib/auth/types";
import { backendFetch, requireToken } from "@/lib/backend-fetch";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ scopeId: string }> }
) {
  const authResult = requireToken(request);
  if (!authResult.ok) {
    return authResult.error;
  }

  const { scopeId } = await context.params;
  const result = await backendFetch<TenantUnityDirectoryResponse>(
    `/auth/tenant/current/scopes/${scopeId}/unities`,
    {
      method: "GET",
      token: authResult.token
    }
  );
  if (!result.ok) {
    return result.error;
  }

  return NextResponse.json(result.data);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ scopeId: string }> }
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

  const { scopeId } = await context.params;
  const result = await backendFetch<TenantUnityDirectoryResponse>(
    `/auth/tenant/current/scopes/${scopeId}/unities`,
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
