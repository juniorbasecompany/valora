import { getTranslations } from "next-intl/server";

import { InfoCard } from "@/component/app-shell/info-card";
import { PageHeader } from "@/component/app-shell/page-header";
import { StatusPanel } from "@/component/app-shell/status-panel";
import {
    BuildingIcon,
    GlobeIcon,
    LocationIcon,
    UsersIcon,
    WorkflowIcon
} from "@/component/ui/ui-icons";
import { HomeChartsClient } from "@/component/home/home-charts-client";
import {
    getAuthSession,
    getTenantScopeDirectory,
    getTenantScopeFieldDirectory,
    getTenantUnityDirectory
} from "@/lib/auth/server-session";
import { mapAppLocaleToLabelLang } from "@/lib/i18n/label-lang";

type AppHomePageProps = {
    params: Promise<{ locale: string }>;
};

export default async function AppHomePage({ params }: AppHomePageProps) {
    const { locale } = await params;
    const t = await getTranslations("HomePage");

    const [authSession, scopeDirectory] = await Promise.all([
        getAuthSession(),
        getTenantScopeDirectory()
    ]);

    const currentScope =
        authSession && scopeDirectory
            ? scopeDirectory.item_list.find(
                  (item) => item.id === authSession.member.current_scope_id
              ) ?? null
            : null;

    const labelLang = mapAppLocaleToLabelLang(locale);

    const [unityDirectory, fieldDirectory] = currentScope
        ? await Promise.all([
              getTenantUnityDirectory(currentScope.id),
              getTenantScopeFieldDirectory(currentScope.id, labelLang)
          ])
        : [null, null];

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

            <HomeChartsClient
                currentScope={currentScope}
                hasAnyScope={(scopeDirectory?.item_list.length ?? 0) > 0}
                unityDirectory={unityDirectory}
                fieldDirectory={fieldDirectory}
                copy={{
                    plantelTitle: t("chart.plantel.title"),
                    plantelDescription: t("chart.plantel.description"),
                    mortalidadeTitle: t("chart.mortalidade.title"),
                    mortalidadeDescription: t("chart.mortalidade.description"),
                    unityLabel: t("chart.filter.unityLabel"),
                    plantelFactLabel: t("chart.filter.plantelFactLabel"),
                    plantelStdLabel: t("chart.filter.plantelStdLabel"),
                    mortalidadeFactLabel: t("chart.filter.mortalidadeFactLabel"),
                    mortalidadeStdLabel: t("chart.filter.mortalidadeStdLabel"),
                    legendFact: t("chart.legend.fact"),
                    legendStd: t("chart.legend.std"),
                    empty: t("chart.empty"),
                    incompleteSelection: t("chart.incompleteSelection"),
                    loadError: t("chart.loadError"),
                    filterToggleAriaLabel: t("chart.filterToggleAriaLabel"),
                    filterToggleLabel: t("chart.filterToggleLabel"),
                    ageAxisLabel: t("chart.ageAxisLabel"),
                    emptyScope: t("chart.emptyScope"),
                    filterAllAria: t("chart.filterAllAria")
                }}
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
            </section>
        </section>
    );
}
