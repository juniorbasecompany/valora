import { NextRequest, NextResponse } from "next/server";

import { backendFetch, requireToken } from "@/lib/backend-fetch";
import type { TenantListResponse } from "@/lib/auth/types";

export async function GET(request: NextRequest) {
  const authResult = requireToken(request);
  if (!authResult.ok) {
    return authResult.error;
  }

  const result = await backendFetch<TenantListResponse>("/auth/tenant/list", {
    method: "GET",
    token: authResult.token
  });
  if (!result.ok) {
    return result.error;
  }

  return NextResponse.json(result.data);
}
