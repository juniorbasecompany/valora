import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { InfoCard } from "@/component/app-shell/info-card";
import { PageHeader } from "@/component/app-shell/page-header";
import { StatusPanel } from "@/component/app-shell/status-panel";
import { QuickActionCard } from "@/component/home/quick-action-card";
import {
  NavigationIcon,
  SparkIcon,
  WorkflowIcon
} from "@/component/ui/ui-icons";
import { isAppModuleKey } from "@/lib/app-shell/module-navigation";

type ModulePlaceholderPageProps = {
  params: Promise<{ locale: string; module: string }>;
};

export default async function ModulePlaceholderPage({
  params
}: ModulePlaceholderPageProps) {
  const { locale, module } = await params;

  if (!isAppModuleKey(module)) {
    notFound();
  }

  const appShellT = await getTranslations("AppShell");
  const t = await getTranslations("ModulePlaceholderPage");
  const moduleLabelByKey = {
    operation: appShellT("navigation.operation"),
    record: appShellT("navigation.record"),
    import: appShellT("navigation.import"),
    process: appShellT("navigation.process"),
    audit: appShellT("navigation.audit")
  } as const;
  const moduleLabel = moduleLabelByKey[module];

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={moduleLabel}
        description={t("description", { module: moduleLabel })}
        actionSlot={
          <StatusPanel
            title={t("status.title")}
            description={t("status.description")}
            tone="neutral"
          />
        }
      />

      <section className="grid gap-4 xl:grid-cols-3">
        <InfoCard
          title={t("cards.entry.title")}
          description={t("cards.entry.description", { module: moduleLabel })}
          iconSlot={<NavigationIcon kind={module} className="h-[1.05rem] w-[1.05rem]" />}
        />
        <InfoCard
          title={t("cards.state.title")}
          description={t("cards.state.description")}
          iconSlot={<WorkflowIcon className="h-[1.05rem] w-[1.05rem]" />}
        />
        <InfoCard
          title={t("cards.next.title")}
          description={t("cards.next.description")}
          iconSlot={<SparkIcon className="h-[1.05rem] w-[1.05rem]" />}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <QuickActionCard
          title={t("actions.home.title")}
          description={t("actions.home.description")}
          href={`/${locale}/app`}
          actionLabel={t("actions.home.label")}
          iconSlot={<NavigationIcon kind="home" className="h-[1.05rem] w-[1.05rem]" />}
        />
        <QuickActionCard
          title={t("actions.configuration.title")}
          description={t("actions.configuration.description")}
          href={`/${locale}/app/configuration`}
          actionLabel={t("actions.configuration.label")}
          iconSlot={<SparkIcon className="h-[1.05rem] w-[1.05rem]" />}
        />
      </section>
    </section>
  );
}
