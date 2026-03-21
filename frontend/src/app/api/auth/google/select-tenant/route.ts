import { NextRequest } from "next/server";

import { backendFetch, errorResponse, successWithCookie } from "@/lib/backend-fetch";

type TokenResponse = {
  access_token: string;
  token_type: string;
};

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    id_token?: string;
    tenant_id?: number;
  };

  if (!body.id_token || !body.tenant_id) {
    return errorResponse("id_token e tenant_id são obrigatórios", 400);
  }

  const result = await backendFetch<TokenResponse>("/auth/google/select-tenant", {
    method: "POST",
    body
  });
  if (!result.ok) {
    return result.error;
  }

  return successWithCookie(result.data, result.data.access_token);
}
