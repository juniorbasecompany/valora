import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  authSessionCookieName,
  hasSimulatedSession
} from "@/lib/auth/session";

type LocalePageProps = {
  params: Promise<{ locale: string }>;
};

export default async function LocalePage({ params }: LocalePageProps) {
  const { locale } = await params;
  const cookieStore = await cookies();
  const sessionValue = cookieStore.get(authSessionCookieName)?.value;

  if (hasSimulatedSession(sessionValue)) {
    redirect(`/${locale}/app`);
  }

  redirect(`/${locale}/login`);
}
