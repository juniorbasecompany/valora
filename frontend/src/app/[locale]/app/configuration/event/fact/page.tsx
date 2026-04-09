import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { EventConfigurationClient } from "@/component/configuration/event-configuration-client";
import { ConfigurationWorkspaceSkeleton } from "@/component/ui/skeleton-patterns";
import {
  getAuthSession,
  getTenantLocationDirectory,
  getTenantScopeActionDirectory,
  getTenantScopeDirectory,
  getTenantScopeEventDirectory,
  getTenantItemDirectory,
  getTenantUnityDirectory
} from "@/lib/auth/server-session";
import { mapAppLocaleToLabelLang } from "@/lib/i18n/label-lang";

type EventFactConfigurationPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function EventFactConfigurationPage({
  params
}: EventFactConfigurationPageProps) {
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
  const basePath = `/${locale}/app/configuration/event/fact`;

  const [eventDirectory, locationDirectory, itemDirectory, actionDirectory, unityDirectory] =
    currentScope != null
      ? await Promise.all([
        getTenantScopeEventDirectory(currentScope.id, {
          label_lang: labelLang,
          event_kind: "fact"
        }),
        getTenantLocationDirectory(currentScope.id),
        getTenantItemDirectory(currentScope.id),
        getTenantScopeActionDirectory(currentScope.id, labelLang),
        getTenantUnityDirectory(currentScope.id)
      ])
      : [null, null, null, null, null];

  const t = await getTranslations("EventConfigurationPageFact");
  const tState = await getTranslations("State");

  return (
    <Suspense
      fallback={
        <ConfigurationWorkspaceSkeleton busyAriaLabel={tState("loadingAriaLabel")} />
      }
    >
      <EventConfigurationClient
        locale={locale}
        labelLang={labelLang}
        variant="fact"
        basePath={basePath}
        currentScope={currentScope}
        hasAnyScope={scopeDirectory.item_list.length > 0}
        initialEventDirectory={eventDirectory}
        initialLocationDirectory={locationDirectory}
        initialItemDirectory={itemDirectory}
        initialActionDirectory={actionDirectory}
        initialUnityDirectory={unityDirectory}
        copy={{
          title: t("title"),
          description: t("description"),
          emptyScope: t("list.emptyScope"),
          missingCurrentScope: t("list.missingCurrentScope"),
          loadError: t("list.loadError"),
          historyTitle: t("history.title"),
          historyDescription: t("history.description"),
          momentLabel: t("section.moment.label"),
          momentHint: t("section.moment.hint"),
          unityLabel: t("section.unity.label"),
          unityHint: t("section.unity.hint"),
          locationLabel: t("section.location.label"),
          locationHint: t("section.location.hint"),
          itemLabel: t("section.item.label"),
          itemHint: t("section.item.hint"),
          actionLabel: t("section.action.label"),
          actionHint: t("section.action.hint"),
          actionInputSectionTitle: t("section.actionInput.title"),
          actionInputSectionHint: t("section.actionInput.hint"),
          actionInputLoadingAriaLabel: t("section.actionInput.loadingAriaLabel"),
          actionInputLoadError: t("section.actionInput.loadError"),
          actionInputSaveError: t("section.actionInput.saveError"),
          filterTitle: t("filter.title"),
          filterToggleAriaLabel: t("filter.toggleAriaLabel"),
          filterToggleLabel: t("filter.toggleLabel"),
          filterMomentFromLabel: t("filter.momentFromLabel"),
          filterMomentToLabel: t("filter.momentToLabel"),
          filterLocationLabel: t("filter.locationLabel"),
          filterItemLabel: t("filter.itemLabel"),
          filterActionLabel: t("filter.actionLabel"),
          filterAll: t("filter.all"),
          filterAllAria: t("filter.allAria"),
          filterConfirm: t("filter.confirm"),
          fallbackLocation: t("list.fallbackLocation"),
          fallbackUnity: t("list.fallbackUnity"),
          fallbackItem: t("list.fallbackItem"),
          fallbackAction: t("list.fallbackAction"),
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
          unityRequired: t("error.unityRequired"),
          locationRequired: t("error.locationRequired"),
          itemRequired: t("error.itemRequired"),
          actionRequired: t("error.actionRequired"),
          discardConfirm: t("discardConfirm"),
          scopeEventApiError: {
            event_moment_requires_unity: t("error.api.event_moment_requires_unity"),
            event_standard_moment_forbidden: t("error.api.event_standard_moment_forbidden"),
            event_fact_moment_required: t("error.api.event_fact_moment_required")
          }
        }}
      />
    </Suspense>
  );
}
