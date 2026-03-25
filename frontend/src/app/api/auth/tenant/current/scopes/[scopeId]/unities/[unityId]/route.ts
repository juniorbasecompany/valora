import { NextRequest, NextResponse } from "next/server";

import type { TenantUnityDirectoryResponse } from "@/lib/auth/types";
import { backendFetch, requireToken } from "@/lib/backend-fetch";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ scopeId: string; unityId: string }> }
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

  const { scopeId, unityId } = await context.params;
  const result = await backendFetch<TenantUnityDirectoryResponse>(
    `/auth/tenant/current/scopes/${scopeId}/unities/${unityId}`,
    {
      method: "PATCH",
      token: authResult.token,
      body
    }
  );
  if (!result.ok) {
    return result.error;
  }

  return NextResponse.json(result.data);
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ scopeId: string; unityId: string }> }
) {
  const authResult = requireToken(request);
  if (!authResult.ok) {
    return authResult.error;
  }

  const { scopeId, unityId } = await context.params;
  const result = await backendFetch<TenantUnityDirectoryResponse>(
    `/auth/tenant/current/scopes/${scopeId}/unities/${unityId}`,
    {
      method: "DELETE",
      token: authResult.token
    }
  );
  if (!result.ok) {
    return result.error;
  }

  return NextResponse.json(result.data);
}
