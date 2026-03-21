import { getTranslations } from "next-intl/server";

import { InfoCard } from "@/component/app-shell/info-card";
import { PageHeader } from "@/component/app-shell/page-header";
import { StatusPanel } from "@/component/app-shell/status-panel";
import { QuickActionCard } from "@/component/home/quick-action-card";
import { SetupStepCard } from "@/component/home/setup-step-card";

type AppHomePageProps = {
  params: Promise<{ locale: string }>;
};

export default async function AppHomePage({ params }: AppHomePageProps) {
  const { locale } = await params;
  const t = await getTranslations("HomePage");

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
        actionSlot={
          <StatusPanel
            title={t("status.title")}
            description={t("status.description")}
            tone="attention"
          />
        }
      />

      <section className="grid gap-4 xl:grid-cols-3">
        <InfoCard
          title={t("context.workspace.title")}
          description={t("context.workspace.description")}
        />
        <InfoCard
          title={t("context.locale.title")}
          description={t("context.locale.description")}
        />
        <InfoCard
          title={t("context.entryFlow.title")}
          description={t("context.entryFlow.description")}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="flex flex-col gap-4">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold tracking-tight text-white">
              {t("setup.title")}
            </h2>
            <p className="text-sm leading-6 text-slate-400">
              {t("setup.description")}
            </p>
          </div>

          <div className="grid gap-4">
            <SetupStepCard
              title={t("setup.steps.organization.title")}
              description={t("setup.steps.organization.description")}
              statusLabel={t("setup.steps.organization.status")}
              tone="attention"
            />
            <SetupStepCard
              title={t("setup.steps.member.title")}
              description={t("setup.steps.member.description")}
              statusLabel={t("setup.steps.member.status")}
              tone="neutral"
            />
            <SetupStepCard
              title={t("setup.steps.scope.title")}
              description={t("setup.steps.scope.description")}
              statusLabel={t("setup.steps.scope.status")}
              tone="neutral"
            />
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold tracking-tight text-white">
              {t("quickAction.title")}
            </h2>
            <p className="text-sm leading-6 text-slate-400">
              {t("quickAction.description")}
            </p>
          </div>

          <div className="grid gap-4">
            <QuickActionCard
              title={t("quickAction.configuration.title")}
              description={t("quickAction.configuration.description")}
              href={`/${locale}/app/configuration`}
              actionLabel={t("quickAction.configuration.action")}
            />
            <QuickActionCard
              title={t("quickAction.plan.title")}
              description={t("quickAction.plan.description")}
              href={`/${locale}/app/configuration`}
              actionLabel={t("quickAction.plan.action")}
            />
          </div>
        </div>
      </section>
    </section>
  );
}
