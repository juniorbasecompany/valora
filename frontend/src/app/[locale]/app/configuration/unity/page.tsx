import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { UnityConfigurationClient } from "@/component/configuration/unity-configuration-client";
import {
  getAuthSession,
  getTenantItemDirectory,
  getTenantLocationDirectory,
  getTenantScopeDirectory,
  getTenantUnityDirectory
} from "@/lib/auth/server-session";

type UnityConfigurationPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function UnityConfigurationPage({ params }: UnityConfigurationPageProps) {
  const { locale } = await params;
  const [authSession, scopeDirectory] = await Promise.all([
    getAuthSession(),
    getTenantScopeDirectory()
  ]);

  if (!authSession || !scopeDirectory) {
    redirect(`/${locale}/login?reason=auth_required`);
  }

  const currentScope =
    scopeDirectory.item_list.find((item) => item.id === authSession.member.current_scope_id) ??
    null;

  const [unityDirectory, locationDirectory, itemDirectory] =
    currentScope != null
      ? await Promise.all([
        getTenantUnityDirectory(currentScope.id),
        getTenantLocationDirectory(currentScope.id),
        getTenantItemDirectory(currentScope.id)
      ])
      : [null, null, null];

  const t = await getTranslations("UnityConfigurationPage");
  const tState = await getTranslations("State");

  return (
    <Suspense
      fallback={
        <div className="ui-panel ui-empty-panel">{tState("loadingDescription")}</div>
      }
    >
      <UnityConfigurationClient
        locale={locale}
        currentScope={currentScope}
        hasAnyScope={scopeDirectory.item_list.length > 0}
        initialUnityDirectory={unityDirectory}
        initialLocationDirectory={locationDirectory}
        itemRecordList={itemDirectory?.item_list ?? []}
        copy={{
          title: t("title"),
          description: t("description"),
          emptyScope: t("list.emptyScope"),
          missingCurrentScope: t("list.missingCurrentScope"),
          loadError: t("list.loadError"),
          historyTitle: t("history.title"),
          historyDescription: t("history.description"),
          filterSearchLabel: t("filter.searchLabel"),
          filterToggleAriaLabel: t("filter.toggleAriaLabel"),
          filterToggleLabel: t("filter.toggleLabel"),
          locationLabel: t("section.location.label"),
          locationAllLabel: t("filter.all"),
          locationHint: t("section.location.hint"),
          itemSectionLabel: t("section.item.label"),
          itemAllLabel: t("filter.all"),
          itemConfirmLabel: t("filter.confirm"),
          itemHint: t("section.item.hint"),
          validationItem: t("error.validationItem"),
          validationLocation: t("error.validationLocation"),
          validationLocationSelect: t("error.validationLocationSelect"),
          nameLabel: t("section.name.label"),
          nameHint: t("section.name.hint"),
          validationName: t("error.validationName"),
          cancel: t("action.cancel"),
          directoryCreateLabel: t("action.new"),
          delete: t("action.delete"),
          undoDelete: t("action.undoDelete"),
          save: t("action.save"),
          saving: t("action.saving"),
          readOnlyNotice: t("readOnlyNotice"),
          saveError: t("error.save"),
          createError: t("error.create"),
          deleteError: t("error.delete"),
          discardConfirm: t("discardConfirm")
        }}
      />
    </Suspense>
  );
}
