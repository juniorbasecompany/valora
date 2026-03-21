import { redirect } from "next/navigation";

import { routing } from "@/i18n/routing";
import { getAuthSession } from "@/lib/auth/server-session";

export default async function RootPage() {
  const locale = routing.defaultLocale;
  const authSession = await getAuthSession();

  if (authSession) {
    redirect(`/${locale}/app`);
  }

  redirect(`/${locale}/login`);
}
