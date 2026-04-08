import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { CurrentAgeCalculationClient } from "@/component/calculation/current-age-calculation-client";
import {
  getAuthSession,
  getTenantItemDirectory,
  getTenantLocationDirectory,
  getTenantScopeActionFormulaList,
  getTenantScopeActionDirectory,
  getTenantScopeDirectory,
  getTenantScopeFieldDirectory,
  getTenantUnityDirectory
} from "@/lib/auth/server-session";
import { mapAppLocaleToLabelLang } from "@/lib/i18n/label-lang";

type CalculationPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function CalculationPage({ params }: CalculationPageProps) {
  const { locale } = await params;
  const [authSession, scopeDirectory] = await Promise.all([
    getAuthSession(),
    getTenantScopeDirectory()
  ]);

  if (!authSession || !scopeDirectory) {
    redirect(`/${locale}/login?reason=auth_required`);
  }

  const currentScope =
    scopeDirectory.item_list.find(
      (item) => item.id === authSession.member.current_scope_id
    ) ?? null;
  const labelLang = mapAppLocaleToLabelLang(locale);

  const [fieldDirectory, locationDirectory, itemDirectory, actionDirectory, unityDirectory] =
    currentScope != null
      ? await Promise.all([
        getTenantScopeFieldDirectory(currentScope.id, labelLang),
        getTenantLocationDirectory(currentScope.id),
        getTenantItemDirectory(currentScope.id),
        getTenantScopeActionDirectory(currentScope.id, labelLang),
        getTenantUnityDirectory(currentScope.id)
      ])
      : [null, null, null, null, null];

  const initialFormulaList =
    currentScope != null && actionDirectory != null
      ? (
        await Promise.all(
          actionDirectory.item_list.map(async (action) => {
            const response = await getTenantScopeActionFormulaList(currentScope.id, action.id);
            return response?.item_list ?? [];
          })
        )
      ).flat()
      : [];

  const t = await getTranslations("CalculationPage");
  const tState = await getTranslations("State");

  return (
    <Suspense
      fallback={(
        <div className="ui-panel ui-empty-panel">
          {tState("loadingDescription")}
        </div>
      )}
    >
      <CurrentAgeCalculationClient
        locale={locale}
        currentScope={currentScope}
        hasAnyScope={scopeDirectory.item_list.length > 0}
        initialFieldDirectory={fieldDirectory}
        initialLocationDirectory={locationDirectory}
        initialItemDirectory={itemDirectory}
        initialUnityDirectory={unityDirectory}
        initialActionDirectory={actionDirectory}
        initialFormulaList={initialFormulaList}
        copy={{
          title: t("title"),
          description: t("description"),
          statusReadyTitle: t("status.readyTitle"),
          statusReadyDescription: t("status.readyDescription"),
          statusMissingTitle: t("status.missingTitle"),
          statusMissingDescription: t("status.missingDescription"),
          emptyScope: t("state.emptyScope"),
          missingCurrentScope: t("state.missingCurrentScope"),
          readOnlyNotice: t("state.readOnlyNotice"),
          startLabel: t("panel.startLabel"),
          endLabel: t("panel.endLabel"),
          startHint: t("panel.startHint"),
          endHint: t("panel.endHint"),
          unityLabel: t("panel.unityLabel"),
          unityHint: t("panel.unityHint"),
          filterAllAria: t("panel.filterAllAria"),
          locationLabel: t("panel.locationLabel"),
          locationHint: t("panel.locationHint"),
          itemLabel: t("panel.itemLabel"),
          itemHint: t("panel.itemHint"),
          read: t("panel.read"),
          reading: t("panel.reading"),
          calculate: t("panel.calculate"),
          calculating: t("panel.calculating"),
          delete: t("panel.delete"),
          deleting: t("panel.deleting"),
          validationRequired: t("panel.validationRequired"),
          validationOrder: t("panel.validationOrder"),
          calculateError: t("panel.error"),
          calculateErrorMissingFormulaInput: t.raw("panel.errorMissingFormulaInput"),
          deleteError: t("panel.deleteError"),
          resultEmptyDefault: t("result.empty"),
          resultEmptyNoEventsBeforePeriodEnd: t("result.emptyNoEventsBeforePeriodEnd"),
          resultEmptyNoEligibleWindow: t("result.emptyNoEligibleWindow"),
          resultEmptyNoResultsInSelectedPeriod: t("result.emptyNoResultsInSelectedPeriod"),
          resultEmptyNoPersistedResultsInPeriod: t("result.emptyNoPersistedResultsInPeriod"),
          resultEmptyNoResultsToDeleteInPeriod: t("result.emptyNoResultsToDeleteInPeriod"),
          resultDateLabel: t("result.dateLabel"),
          actionLabel: t("result.actionLabel"),
          formulaLabel: t("result.formulaLabel"),
          emptyValue: t("result.emptyValue"),
          fallbackAction: t("result.fallbackAction")
        }}
      />
    </Suspense>
  );
}
