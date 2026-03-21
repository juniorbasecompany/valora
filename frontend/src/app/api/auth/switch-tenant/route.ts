import { NextRequest } from "next/server";

import {
  backendFetch,
  errorResponse,
  requireToken,
  successWithCookie
} from "@/lib/backend-fetch";

type TokenResponse = {
  access_token: string;
  token_type: string;
};

export async function POST(request: NextRequest) {
  const authResult = requireToken(request);
  if (!authResult.ok) {
    return authResult.error;
  }

  const body = (await request.json()) as { tenant_id?: number };
  if (!body.tenant_id) {
    return errorResponse("tenant_id é obrigatório", 400);
  }

  const result = await backendFetch<TokenResponse>("/auth/switch-tenant", {
    method: "POST",
    body,
    token: authResult.token
  });
  if (!result.ok) {
    return result.error;
  }

  return successWithCookie(result.data, result.data.access_token);
}
