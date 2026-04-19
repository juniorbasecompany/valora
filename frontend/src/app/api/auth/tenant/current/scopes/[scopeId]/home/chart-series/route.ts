import { NextRequest, NextResponse } from "next/server";

import type { ScopeHomeChartSeriesResponse } from "@/lib/auth/types";
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
  const search = request.nextUrl.search;
  const endpoint = `/auth/tenant/current/scopes/${scopeId}/home/chart-series${search}`;
  const result = await backendFetch<ScopeHomeChartSeriesResponse>(endpoint, {
    method: "GET",
    token: authResult.token
  });
  if (!result.ok) {
    return result.error;
  }

  return NextResponse.json(result.data);
}
