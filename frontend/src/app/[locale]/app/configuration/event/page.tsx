import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { EventConfigurationClient } from "@/component/configuration/event-configuration-client";
import {
  getAuthSession,
  getTenantLocationDirectory,
  getTenantScopeActionDirectory,
  getTenantScopeDirectory,
  getTenantScopeEventDirectory,
  getTenantUnityDirectory
} from "@/lib/auth/server-session";
import { mapAppLocaleToLabelLang } from "@/lib/i18n/label-lang";

type EventConfigurationPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function EventConfigurationPage({ params }: EventConfigurationPageProps) {
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

  const [eventDirectory, locationDirectory, unityDirectory, actionDirectory] =
    currentScope != null
      ? await Promise.all([
        getTenantScopeEventDirectory(currentScope.id),
        getTenantLocationDirectory(currentScope.id),
        getTenantUnityDirectory(currentScope.id),
        getTenantScopeActionDirectory(currentScope.id, labelLang)
      ])
      : [null, null, null, null];

  const t = await getTranslations("EventConfigurationPage");
  const tState = await getTranslations("State");

  return (
    <Suspense
      fallback={
        <div className="ui-panel ui-empty-panel">
          {tState("loadingDescription")}
        </div>
      }
    >
      <EventConfigurationClient
        locale={locale}
        labelLang={labelLang}
        currentScope={currentScope}
        hasAnyScope={scopeDirectory.item_list.length > 0}
        initialEventDirectory={eventDirectory}
        initialLocationDirectory={locationDirectory}
        initialUnityDirectory={unityDirectory}
        initialActionDirectory={actionDirectory}
        copy={{
          title: t("title"),
          description: t("description"),
          empty: t("empty"),
          emptyScope: t("list.emptyScope"),
          missingCurrentScope: t("list.missingCurrentScope"),
          loadError: t("list.loadError"),
          historyTitle: t("history.title"),
          historyDescription: t("history.description"),
          momentLabel: t("section.moment.label"),
          momentHint: t("section.moment.hint"),
          locationLabel: t("section.location.label"),
          locationHint: t("section.location.hint"),
          unityLabel: t("section.unity.label"),
          unityHint: t("section.unity.hint"),
          actionLabel: t("section.action.label"),
          actionHint: t("section.action.hint"),
          actionInputSectionTitle: t("section.actionInput.title"),
          actionInputSectionHint: t("section.actionInput.hint"),
          actionInputEmpty: t("section.actionInput.empty"),
          actionInputLoading: t("section.actionInput.loading"),
          actionInputLoadError: t("section.actionInput.loadError"),
          actionInputSaveError: t("section.actionInput.saveError"),
          filterTitle: t("filter.title"),
          filterMomentFromLabel: t("filter.momentFromLabel"),
          filterMomentToLabel: t("filter.momentToLabel"),
          filterLocationLabel: t("filter.locationLabel"),
          filterUnityLabel: t("filter.unityLabel"),
          filterActionLabel: t("filter.actionLabel"),
          filterAll: t("filter.all"),
          filterAllAria: t("filter.allAria"),
          filterConfirm: t("filter.confirm"),
          sectionInfoTitle: t("section.info.title"),
          sectionInfoDescription: t("section.info.description"),
          infoSummaryLabel: t("section.info.summaryLabel"),
          infoCreateLead: t("section.info.createLead"),
          infoCreateHint: t("section.info.createHint"),
          fallbackLocation: t("list.fallbackLocation"),
          fallbackUnity: t("list.fallbackUnity"),
          fallbackAction: t("list.fallbackAction"),
          fallbackEvent: t("list.fallbackEvent"),
          cancel: t("buttons.cancel"),
          directoryCreateLabel: t("buttons.new"),
          delete: t("buttons.delete"),
          undoDelete: t("buttons.undoDelete"),
          save: t("buttons.save"),
          saving: t("buttons.saving"),
          readOnlyNotice: t("readOnlyNotice"),
          saveError: t("error.save"),
          createError: t("error.create"),
          deleteError: t("error.delete"),
          deleteBlockedDetail: t("error.deleteBlockedDetail"),
          momentRequired: t("error.momentRequired"),
          locationRequired: t("error.locationRequired"),
          unityRequired: t("error.unityRequired"),
          actionRequired: t("error.actionRequired"),
          discardConfirm: t("discardConfirm")
        }}
      />
    </Suspense>
  );
}
