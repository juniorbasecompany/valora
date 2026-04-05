import { NextRequest, NextResponse } from "next/server";

import type { TenantKindListResponse } from "@/lib/auth/types";
import { backendFetch, requireToken } from "@/lib/backend-fetch";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ scopeId: string; kindId: string }> }
) {
  const authResult = requireToken(request);
  if (!authResult.ok) {
    return authResult.error;
  }

  const { scopeId, kindId } = await context.params;
  const result = await backendFetch<TenantKindListResponse>(
    `/auth/tenant/current/scopes/${scopeId}/kind/${kindId}`,
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
