import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { AppShell } from "@/component/app-shell/app-shell";
import { AccountMenu } from "@/component/app-shell/account-menu";
import { WorkspaceContextMenu } from "@/component/app-shell/workspace-context-menu";
import { getAuthSession, getTenantScopeDirectory } from "@/lib/auth/server-session";
import { appModuleKeyList } from "@/lib/app-shell/module-navigation";
import { routing } from "@/i18n/routing";

type AppLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

function getScopeDisplayName(scope: {
  id: number;
  name: string;
  display_name: string;
}) {
  return scope.name.trim() || scope.display_name.trim() || `#${scope.id}`;
}

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

  const scopeDirectory = await getTenantScopeDirectory();
  const currentScopeId =
    scopeDirectory?.current_scope_id ?? authSession.member.current_scope_id ?? null;
  const currentScope =
    scopeDirectory?.item_list.find(
      (scope) =>
        scope.id === currentScopeId
    ) ??
    scopeDirectory?.item_list[0] ??
    null;
  const contentContextKey = `tenant:${authSession.tenant.id}:scope:${currentScopeId ?? "none"}`;
  const mobileWorkspaceLabel = currentScope
    ? `${authSession.tenant.display_name} - ${getScopeDisplayName(currentScope)}`
    : authSession.tenant.display_name;

  const navigationItemList = [
    {
      key: "home",
      label: t("navigation.home"),
      href: `/${locale}/app`
    },
    ...appModuleKeyList.map((key) => ({
      key,
      label: t(`navigation.${key}`),
      href: `/${locale}/app/${key}`
    }))
  ];

  return (
    <AppShell
      productName={t("productName")}
      workspaceLabel={authSession.tenant.display_name}
      mobileWorkspaceLabel={mobileWorkspaceLabel}
      workspaceSlot={
        <WorkspaceContextMenu
          currentTenantId={authSession.tenant.id}
          currentTenantName={authSession.tenant.display_name}
          initialScopeList={scopeDirectory?.item_list ?? []}
          initialCurrentScopeId={
            scopeDirectory?.current_scope_id ??
            authSession.member.current_scope_id ??
            null
          }
          copy={{
            tenantTriggerAriaLabel: t("menu.tenantTriggerAriaLabel"),
            tenantMenuAriaLabel: t("menu.tenantMenuAriaLabel"),
            scopeTriggerAriaLabel: t("menu.scopeTriggerAriaLabel"),
            scopeMenuAriaLabel: t("menu.scopeMenuAriaLabel"),
            loadingTenantList: t("menu.loadingTenantList"),
            tenantListError: t("menu.tenantListError"),
            emptyTenantList: t("menu.emptyTenantList"),
            switchingTenant: t("menu.switchingTenant"),
            loadingScopeList: t("menu.loadingScopeList"),
            scopeListError: t("menu.scopeListError"),
            emptyScopeList: t("menu.emptyScopeList"),
            switchingScope: t("menu.switchingScope"),
            noScopeLabel: t("menu.noScopeLabel")
          }}
        />
      }
      navigationItemList={navigationItemList}
      mobileNavigationOpenLabel={t("topbar.openNavigation")}
      mobileNavigationCloseLabel={t("topbar.closeNavigation")}
      accountSlot={
        <AccountMenu
          placement="sidebar"
          currentLocale={locale}
          localeList={[...routing.locales]}
          accountName={
            authSession.member.display_name ||
            authSession.member.name ||
            authSession.account.display_name ||
            authSession.account.name ||
            authSession.account.email
          }
          configurationHref={`/${locale}/app/configuration`}
          copy={{
            localeFlagTriggerAriaLabel: t("menu.localeFlagTriggerAriaLabel"),
            localeFlagMenuAriaLabel: t("menu.localeFlagMenuAriaLabel"),
            configurationLabel: t("menu.configurationLabel"),
            switchingLocale: t("menu.switchingLocale"),
            signOutLabel: t("topbar.signOut"),
            signOutPendingLabel: t("topbar.signOutPending")
          }}
        />
      }
    >
      <div key={contentContextKey} className="ui-contents">
        {children}
      </div>
    </AppShell>
  );
}
