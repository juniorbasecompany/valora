import { getTranslations } from "next-intl/server";

import { InfoCard } from "@/component/app-shell/info-card";
import { PageHeader } from "@/component/app-shell/page-header";
import { StatusPanel } from "@/component/app-shell/status-panel";
import { SetupStepCard } from "@/component/home/setup-step-card";

export default async function ConfigurationPage() {
  const t = await getTranslations("ConfigurationPage");

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
            tone="neutral"
          />
        }
      />

      <section className="grid gap-4 xl:grid-cols-3">
        <InfoCard
          title={t("cards.organization.title")}
          description={t("cards.organization.description")}
        />
        <InfoCard
          title={t("cards.member.title")}
          description={t("cards.member.description")}
        />
        <InfoCard
          title={t("cards.scope.title")}
          description={t("cards.scope.description")}
        />
      </section>

      <section className="grid gap-4">
        <SetupStepCard
          title={t("queue.organization.title")}
          description={t("queue.organization.description")}
          statusLabel={t("queue.organization.status")}
          tone="attention"
        />
        <SetupStepCard
          title={t("queue.member.title")}
          description={t("queue.member.description")}
          statusLabel={t("queue.member.status")}
          tone="neutral"
        />
        <SetupStepCard
          title={t("queue.scope.title")}
          description={t("queue.scope.description")}
          statusLabel={t("queue.scope.status")}
          tone="neutral"
        />
      </section>
    </section>
  );
}
