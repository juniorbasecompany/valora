import { NextRequest, NextResponse } from "next/server";

import { backendFetch, requireToken } from "@/lib/backend-fetch";
import type { TenantCurrentResponse, TenantDeleteResponse } from "@/lib/auth/types";

export async function GET(request: NextRequest) {
  const authResult = requireToken(request);
  if (!authResult.ok) {
    return authResult.error;
  }

  const result = await backendFetch<TenantCurrentResponse>("/auth/tenant/current", {
    method: "GET",
    token: authResult.token
  });
  if (!result.ok) {
    return result.error;
  }

  return NextResponse.json(result.data);
}

export async function PATCH(request: NextRequest) {
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

  const result = await backendFetch<TenantCurrentResponse>("/auth/tenant/current", {
    method: "PATCH",
    token: authResult.token,
    body
  });
  if (!result.ok) {
    return result.error;
  }

  return NextResponse.json(result.data);
}

export async function DELETE(request: NextRequest) {
  const authResult = requireToken(request);
  if (!authResult.ok) {
    return authResult.error;
  }

  const result = await backendFetch<TenantDeleteResponse>("/auth/tenant/current", {
    method: "DELETE",
    token: authResult.token
  });
  if (!result.ok) {
    return result.error;
  }

  return NextResponse.json(result.data);
}
