import { NextRequest, NextResponse } from "next/server";

import { backendFetch, requireToken } from "@/lib/backend-fetch";

type InviteActionResponse = {
  member_id: number;
  tenant_id: number;
  status: string;
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ memberId: string }> }
) {
  const authResult = requireToken(request);
  if (!authResult.ok) {
    return authResult.error;
  }

  const { memberId } = await context.params;
  const result = await backendFetch<InviteActionResponse>(
    `/auth/invites/${memberId}/reject`,
    {
      method: "POST",
      token: authResult.token
    }
  );
  if (!result.ok) {
    return result.error;
  }

  return NextResponse.json(result.data);
}
