import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { CurrentAgeCalculationClient } from "@/component/calculation/current-age-calculation-client";
import {
  getAuthSession,
  getTenantItemDirectory,
  getTenantLocationDirectory,
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
          calculate: t("panel.calculate"),
          calculating: t("panel.calculating"),
          validationRequired: t("panel.validationRequired"),
          validationOrder: t("panel.validationOrder"),
          calculateError: t("panel.error"),
          fieldsTitle: t("fields.title"),
          fieldsDescription: t("fields.description"),
          initialBadge: t("fields.initialBadge"),
          currentBadge: t("fields.currentBadge"),
          finalBadge: t("fields.finalBadge"),
          targetLabel: t("fields.targetLabel"),
          missingLabel: t("fields.missingLabel"),
          resultTitle: t("result.title"),
          resultDescription: t("result.description"),
          resultPlaceholder: t("result.placeholder"),
          resultEmpty: t("result.empty"),
          createdLabel: t("result.createdLabel"),
          updatedLabel: t("result.updatedLabel"),
          unchangedLabel: t("result.unchangedLabel"),
          statusCreated: t("result.statusCreated"),
          statusUpdated: t("result.statusUpdated"),
          statusUnchanged: t("result.statusUnchanged"),
          locationLabel: t("result.locationLabel"),
          itemLabel: t("result.itemLabel"),
          actionLabel: t("result.actionLabel"),
          fieldLabel: t("result.fieldLabel"),
          formulaLabel: t("result.formulaLabel"),
          formulaOrderLabel: t("result.formulaOrderLabel"),
          calculatedAtLabel: t("result.calculatedAtLabel"),
          emptyValue: t("result.emptyValue"),
          fallbackLocation: t("result.fallbackLocation"),
          fallbackItem: t("result.fallbackItem"),
          fallbackAction: t("result.fallbackAction")
        }}
      />
    </Suspense>
  );
}
