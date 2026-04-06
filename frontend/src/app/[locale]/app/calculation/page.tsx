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
  getTenantScopeFieldDirectory
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

  const [fieldDirectory, locationDirectory, itemDirectory, actionDirectory] =
    currentScope != null
      ? await Promise.all([
        getTenantScopeFieldDirectory(currentScope.id, labelLang),
        getTenantLocationDirectory(currentScope.id),
        getTenantItemDirectory(currentScope.id),
        getTenantScopeActionDirectory(currentScope.id, labelLang)
      ])
      : [null, null, null, null];

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
          dateHint: t("panel.dateHint"),
          read: t("panel.read"),
          reading: t("panel.reading"),
          calculate: t("panel.calculate"),
          calculating: t("panel.calculating"),
          delete: t("panel.delete"),
          deleting: t("panel.deleting"),
          validationRequired: t("panel.validationRequired"),
          validationOrder: t("panel.validationOrder"),
          calculateError: t("panel.error"),
          deleteError: t("panel.deleteError"),
          resultPlaceholder: t("result.placeholder"),
          resultEmpty: t("result.empty"),
          resultDateLabel: t("result.dateLabel"),
          locationLabel: t("result.locationLabel"),
          itemLabel: t("result.itemLabel"),
          actionLabel: t("result.actionLabel"),
          formulaLabel: t("result.formulaLabel"),
          emptyValue: t("result.emptyValue"),
          fallbackLocation: t("result.fallbackLocation"),
          fallbackItem: t("result.fallbackItem"),
          fallbackAction: t("result.fallbackAction")
        }}
      />
    </Suspense>
  );
}
