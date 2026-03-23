import { getTranslations } from "next-intl/server";

import { InfoCard } from "@/component/app-shell/info-card";
import { PageHeader } from "@/component/app-shell/page-header";
import { StatusPanel } from "@/component/app-shell/status-panel";
import { QuickActionCard } from "@/component/home/quick-action-card";
import { SetupStepCard } from "@/component/home/setup-step-card";
import {
  BuildingIcon,
  GlobeIcon,
  ScopeIcon,
  SparkIcon,
  UsersIcon,
  WorkflowIcon
} from "@/component/ui/ui-icons";

type AppHomePageProps = {
  params: Promise<{ locale: string }>;
};

export default async function AppHomePage({ params }: AppHomePageProps) {
  const { locale } = await params;
  const t = await getTranslations("HomePage");

  return (
    <section className="ui-page-stack">
      <PageHeader
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

      <section className="ui-grid-cards-3">
        <InfoCard
          title={t("context.workspace.title")}
          description={t("context.workspace.description")}
          iconSlot={<BuildingIcon className="ui-icon-sm" />}
        />
        <InfoCard
          title={t("context.locale.title")}
          description={t("context.locale.description")}
          iconSlot={<GlobeIcon className="ui-icon-sm" />}
        />
        <InfoCard
          title={t("context.entryFlow.title")}
          description={t("context.entryFlow.description")}
          iconSlot={<WorkflowIcon className="ui-icon-sm" />}
        />
      </section>

      <section className="ui-grid-split-home">
        <div className="ui-panel ui-panel-stack">
          <div className="ui-heading-stack">
            <h2 className="ui-header-title ui-title-section-lg">
              {t("setup.title")}
            </h2>
            <p className="ui-text-note">
              {t("setup.description")}
            </p>
          </div>

          <div className="ui-grid-list">
            <SetupStepCard
              title={t("setup.steps.organization.title")}
              description={t("setup.steps.organization.description")}
              statusLabel={t("setup.steps.organization.status")}
              tone="attention"
              iconSlot={<BuildingIcon className="ui-icon-sm" />}
            />
            <SetupStepCard
              title={t("setup.steps.member.title")}
              description={t("setup.steps.member.description")}
              statusLabel={t("setup.steps.member.status")}
              tone="neutral"
              iconSlot={<UsersIcon className="ui-icon-sm" />}
            />
            <SetupStepCard
              title={t("setup.steps.scope.title")}
              description={t("setup.steps.scope.description")}
              statusLabel={t("setup.steps.scope.status")}
              tone="neutral"
              iconSlot={<ScopeIcon className="ui-icon-sm" />}
            />
          </div>
        </div>

        <div className="ui-panel ui-panel-stack">
          <div className="ui-heading-stack">
            <h2 className="ui-header-title ui-title-section-lg">
              {t("quickAction.title")}
            </h2>
            <p className="ui-text-note">
              {t("quickAction.description")}
            </p>
          </div>

          <div className="ui-grid-list">
            <QuickActionCard
              title={t("quickAction.configuration.title")}
              description={t("quickAction.configuration.description")}
              href={`/${locale}/app/configuration`}
              actionLabel={t("quickAction.configuration.action")}
              iconSlot={<SparkIcon className="ui-icon-sm" />}
            />
            <QuickActionCard
              title={t("quickAction.plan.title")}
              description={t("quickAction.plan.description")}
              href={`/${locale}/app/configuration`}
              actionLabel={t("quickAction.plan.action")}
              iconSlot={<WorkflowIcon className="ui-icon-sm" />}
            />
          </div>
        </div>
      </section>
    </section>
  );
}
