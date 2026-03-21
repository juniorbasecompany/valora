import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { AppShell } from "@/component/app-shell/app-shell";
import { LogoutButton } from "@/component/auth/logout-button";
import { getAuthSession } from "@/lib/auth/server-session";

type AppLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function AppLayout({
  children,
  params
}: AppLayoutProps) {
  const { locale } = await params;
  const t = await getTranslations("AppShell");
  const authSession = await getAuthSession();

  if (!authSession) {
    redirect(`/${locale}/login?reason=auth_required`);
  }

  const navigationItemList = [
    {
      key: "home",
      label: t("navigation.home"),
      href: `/${locale}/app`
    },
    {
      key: "operation",
      label: t("navigation.operation"),
      statusLabel: t("navigation.comingSoon")
    },
    {
      key: "record",
      label: t("navigation.record"),
      statusLabel: t("navigation.comingSoon")
    },
    {
      key: "import",
      label: t("navigation.import"),
      statusLabel: t("navigation.comingSoon")
    },
    {
      key: "process",
      label: t("navigation.process"),
      statusLabel: t("navigation.comingSoon")
    },
    {
      key: "audit",
      label: t("navigation.audit"),
      statusLabel: t("navigation.comingSoon")
    },
    {
      key: "configuration",
      label: t("navigation.configuration"),
      href: `/${locale}/app/configuration`
    }
  ];

  return (
    <AppShell
      productName={t("productName")}
      productStage={t("productStage")}
      workspaceLabel={authSession.tenant.display_name}
      navigationItemList={navigationItemList}
      tenantLabel={t("topbar.tenantLabel")}
      tenantValue={authSession.tenant.display_name}
      localeLabel={t("topbar.localeLabel")}
      localeValue={locale}
      accountLabel={t("topbar.accountLabel")}
      accountValue={authSession.account.email}
      topbarActionSlot={
        <LogoutButton
          locale={locale}
          label={t("topbar.signOut")}
          pendingLabel={t("topbar.signOutPending")}
        />
      }
    >
      {children}
    </AppShell>
  );
}
