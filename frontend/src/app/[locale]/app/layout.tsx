import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";

import { AppShell } from "@/component/app-shell/app-shell";
import { signOutAction } from "@/app/[locale]/auth/action";

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
      workspaceLabel={t("workspaceLabel")}
      navigationItemList={navigationItemList}
      localeLabel={t("topbar.localeLabel")}
      localeValue={locale}
      statusLabel={t("topbar.statusLabel")}
      statusValue={t("topbar.statusValue")}
      topbarActionSlot={
        <form action={signOutAction}>
          <input type="hidden" name="locale" value={locale} />
          <button
            type="submit"
            className="rounded-full border border-slate-800 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 transition hover:border-slate-700 hover:bg-slate-800"
          >
            {t("topbar.signOut")}
          </button>
        </form>
      }
    >
      {children}
    </AppShell>
  );
}
