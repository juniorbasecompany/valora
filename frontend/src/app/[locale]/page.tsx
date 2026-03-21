import { redirect } from "next/navigation";

import { getAuthSession } from "@/lib/auth/server-session";

type LocalePageProps = {
  params: Promise<{ locale: string }>;
};

export default async function LocalePage({ params }: LocalePageProps) {
  const { locale } = await params;
  const authSession = await getAuthSession();

  if (authSession) {
    redirect(`/${locale}/app`);
  }

  redirect(`/${locale}/login`);
}
