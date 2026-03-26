import { NextRequest, NextResponse } from "next/server";

import type { AuditLogListResponse } from "@/lib/auth/types";
import { backendFetch, requireToken } from "@/lib/backend-fetch";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ tableName: string }> }
) {
  const authResult = requireToken(request);
  if (!authResult.ok) {
    return authResult.error;
  }

  const { tableName } = await context.params;
  const search = request.nextUrl.search;
  const endpoint = `/auth/tenant/current/logs/${tableName}${search}`;

  const result = await backendFetch<AuditLogListResponse>(endpoint, {
    method: "GET",
    token: authResult.token
  });
  if (!result.ok) {
    return result.error;
  }

  return NextResponse.json(result.data);
}
