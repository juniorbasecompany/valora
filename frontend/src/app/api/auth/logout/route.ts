import { clearAuthCookie } from "@/lib/backend-fetch";

export async function POST() {
  return clearAuthCookie();
}
