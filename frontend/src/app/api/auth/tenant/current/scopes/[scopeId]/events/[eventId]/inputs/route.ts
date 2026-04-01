import { NextRequest, NextResponse } from "next/server";

import type { ScopeInputListResponse } from "@/lib/auth/types";
import { backendFetch, requireToken } from "@/lib/backend-fetch";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ scopeId: string; eventId: string }> }
) {
  const authResult = requireToken(request);
  if (!authResult.ok) {
    return authResult.error;
  }

  const { scopeId, eventId } = await context.params;
  const result = await backendFetch<ScopeInputListResponse>(
    `/auth/tenant/current/scopes/${scopeId}/events/${eventId}/inputs`,
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
  context: { params: Promise<{ scopeId: string; eventId: string }> }
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

  const { scopeId, eventId } = await context.params;
  const result = await backendFetch<ScopeInputListResponse>(
    `/auth/tenant/current/scopes/${scopeId}/events/${eventId}/inputs`,
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
