import { NextRequest } from "next/server";

import { backendFetch, errorResponse, successWithCookie } from "@/lib/backend-fetch";

type TokenResponse = {
  access_token: string;
  token_type: string;
};

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { id_token?: string };
  if (!body.id_token) {
    return errorResponse("id_token é obrigatório", 400);
  }

  const result = await backendFetch<TokenResponse>("/auth/google/create-tenant", {
    method: "POST",
    body
  });
  if (!result.ok) {
    return result.error;
  }

  return successWithCookie(result.data, result.data.access_token);
}
