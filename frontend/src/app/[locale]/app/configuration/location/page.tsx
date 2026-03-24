import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { LocationConfigurationClient } from "@/component/configuration/location-configuration-client";
import {
  getAuthSession,
  getTenantLocationDirectory,
  getTenantScopeDirectory
} from "@/lib/auth/server-session";

type LocationConfigurationPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function LocationConfigurationPage({
  params
}: LocationConfigurationPageProps) {
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
    ) ??
    null;
  const locationDirectory =
    currentScope != null ? await getTenantLocationDirectory(currentScope.id) : null;

  const t = await getTranslations("LocationConfigurationPage");
  const tState = await getTranslations("State");

  return (
    <Suspense
      fallback={
        <div className="ui-panel ui-empty-panel">
          {tState("loadingDescription")}
        </div>
      }
    >
      <LocationConfigurationClient
        locale={locale}
        currentScope={currentScope}
        hasAnyScope={scopeDirectory.item_list.length > 0}
        initialLocationDirectory={locationDirectory}
        copy={{
          title: t("title"),
          description: t("description"),
          statusTitle: t("status.title"),
          statusDescription: t("status.description"),
          empty: t("list.empty"),
          emptyScope: t("list.emptyScope"),
          missingCurrentScope: t("list.missingCurrentScope"),
          historyTitle: t("history.title"),
          historyDescription: t("history.description"),
          sectionIdentityTitle: t("section.identity.title"),
          sectionIdentityDescription: t("section.identity.description"),
          nameLabel: t("section.identity.nameLabel"),
          nameHint: t("section.identity.nameHint"),
          displayNameLabel: t("section.identity.displayNameLabel"),
          displayNameHint: t("section.identity.displayNameHint"),
          metadataIdLabel: t("metadata.idLabel"),
          metadataPathLabel: t("metadata.pathLabel"),
          metadataChildrenLabel: t("metadata.childrenLabel"),
          metadataDescendantsLabel: t("metadata.descendantsLabel"),
          dragDropHint: t("dragDropHint"),
          cancel: t("action.cancel"),
          newLabel: t("action.newLabel"),
          newChild: t("action.newChild"),
          newSibling: t("action.newSibling"),
          delete: t("action.delete"),
          undoDelete: t("action.undoDelete"),
          save: t("action.save"),
          saving: t("action.saving"),
          moveUp: t("action.moveUp"),
          moveDown: t("action.moveDown"),
          readOnlyNotice: t("readOnlyNotice"),
          movedNotice: t("movedNotice"),
          loadError: t("error.load"),
          moveError: t("error.move"),
          validationError: t("error.validation"),
          discardConfirm: t("discardConfirm"),
          newLocationTitle: t("newLocationTitle")
        }}
      />
    </Suspense>
  );
}
