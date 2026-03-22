import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { AppShell } from "@/component/app-shell/app-shell";
import { AccountMenu } from "@/component/app-shell/account-menu";
import { getAuthSession } from "@/lib/auth/server-session";
import { routing } from "@/i18n/routing";

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
  ];

  return (
    <AppShell
      productName={t("productName")}
      workspaceLabel={authSession.tenant.display_name}
      navigationItemList={navigationItemList}
      mobileNavigationOpenLabel={t("topbar.openNavigation")}
      mobileNavigationCloseLabel={t("topbar.closeNavigation")}
      accountSlot={
        <AccountMenu
          placement="sidebar"
          currentLocale={locale}
          localeList={[...routing.locales]}
          accountName={
            authSession.account.display_name ||
            authSession.account.name ||
            authSession.account.email
          }
          currentTenantId={authSession.tenant.id}
          configurationHref={`/${locale}/app/configuration`}
          copy={{
            tenantSectionLabel: t("menu.tenantSectionLabel"),
            localeFlagTriggerAriaLabel: t("menu.localeFlagTriggerAriaLabel"),
            localeFlagMenuAriaLabel: t("menu.localeFlagMenuAriaLabel"),
            configurationLabel: t("menu.configurationLabel"),
            loadingTenantList: t("menu.loadingTenantList"),
            tenantListError: t("menu.tenantListError"),
            emptyTenantList: t("menu.emptyTenantList"),
            switchingTenant: t("menu.switchingTenant"),
            switchingLocale: t("menu.switchingLocale"),
            activeLabel: t("menu.activeLabel"),
            signOutLabel: t("topbar.signOut"),
            signOutPendingLabel: t("topbar.signOutPending")
          }}
        />
      }
    >
      {children}
    </AppShell>
  );
}
