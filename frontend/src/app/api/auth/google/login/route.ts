import { NextRequest, NextResponse } from "next/server";

import { backendFetch, errorResponse, successWithCookie } from "@/lib/backend-fetch";
import type { AuthResponse } from "@/lib/auth/types";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { id_token?: string };
  if (!body.id_token) {
    return errorResponse("id_token é obrigatório", 400);
  }

  const result = await backendFetch<AuthResponse>("/auth/google", {
    method: "POST",
    body: { id_token: body.id_token }
  });
  if (!result.ok) {
    return result.error;
  }

  const data = result.data;
  if (data.requires_tenant_selection) {
    return NextResponse.json(data);
  }

  if (data.access_token) {
    return successWithCookie(data, data.access_token);
  }

  return NextResponse.json(data);
}
