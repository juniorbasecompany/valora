import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { routing } from "@/i18n/routing";
import {
  authSessionCookieName,
  hasSimulatedSession
} from "@/lib/auth/session";

export default async function RootPage() {
  const cookieStore = await cookies();
  const sessionValue = cookieStore.get(authSessionCookieName)?.value;
  const locale = routing.defaultLocale;

  if (hasSimulatedSession(sessionValue)) {
    redirect(`/${locale}/app`);
  }

  redirect(`/${locale}/login`);
}
