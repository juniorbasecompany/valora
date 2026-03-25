import { getTranslations } from "next-intl/server";

import { InfoCard } from "@/component/app-shell/info-card";
import { PageHeader } from "@/component/app-shell/page-header";
import { StatusPanel } from "@/component/app-shell/status-panel";
import {
    AuditIcon,
    BuildingIcon,
    GlobeIcon,
    ImportIcon,
    LocationIcon,
    ProcessIcon,
    RecordsIcon,
    UsersIcon,
    WorkflowIcon
} from "@/component/ui/ui-icons";

export default async function AppHomePage() {
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
                        tone="positive"
                    />
                }
            />

            <section className="ui-grid-cards-3">
                <InfoCard
                    title={t("context.workspace.title")}
                    description={t("context.workspace.description")}
                    iconSlot={<BuildingIcon className="ui-icon" />}
                />
                <InfoCard
                    title={t("context.locale.title")}
                    description={t("context.locale.description")}
                    iconSlot={<GlobeIcon className="ui-icon" />}
                />
                <InfoCard
                    title={t("context.entryFlow.title")}
                    description={t("context.entryFlow.description")}
                    iconSlot={<WorkflowIcon className="ui-icon" />}
                />
                <InfoCard
                    title={t("card.tenant.title")}
                    description={t("card.tenant.description")}
                    iconSlot={<UsersIcon className="ui-icon" />}
                />
                <InfoCard
                    title={t("card.location.title")}
                    description={t("card.location.description")}
                    iconSlot={<LocationIcon className="ui-icon" />}
                />
                <InfoCard
                    title={t("card.record.title")}
                    description={t("card.record.description")}
                    iconSlot={<RecordsIcon className="ui-icon" />}
                />
                <InfoCard
                    title={t("card.import.title")}
                    description={t("card.import.description")}
                    iconSlot={<ImportIcon className="ui-icon" />}
                />
                <InfoCard
                    title={t("card.process.title")}
                    description={t("card.process.description")}
                    iconSlot={<ProcessIcon className="ui-icon" />}
                />
                <InfoCard
                    title={t("card.audit.title")}
                    description={t("card.audit.description")}
                    iconSlot={<AuditIcon className="ui-icon" />}
                />
            </section>
        </section>
    );
}
