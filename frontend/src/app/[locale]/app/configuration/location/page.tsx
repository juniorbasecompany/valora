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
          emptyScope: t("list.emptyScope"),
          missingCurrentScope: t("list.missingCurrentScope"),
          historyTitle: t("history.title"),
          historyDescription: t("history.description"),
          filterSearchLabel: t("filter.searchLabel"),
          sectionStructureTitle: t("section.structure.title"),
          sectionStructureDescription: t("section.structure.description"),
          sectionStructureLevelLabel: t("section.structure.levelLabel"),
          sectionStructureLevelHint: t("section.structure.levelHint"),
          sectionStructureParentLabel: t("section.structure.parentLabel"),
          sectionStructureParentRoot: t("section.structure.parentRoot"),
          sectionStructureOrderLabel: t("section.structure.orderLabel"),
          sectionStructureOrderHintEdit: t("section.structure.orderHintEdit"),
          sectionStructureOrderHintCreate: t("section.structure.orderHintCreate"),
          sectionStructureOrderPending: t("section.structure.orderPending"),
          nameLabel: t("section.identity.nameLabel"),
          nameHint: t("section.identity.nameHint"),
          displayNameLabel: t("section.identity.displayNameLabel"),
          displayNameHint: t("section.identity.displayNameHint"),
          dragHandleAria: t("dragHandleAria"),
          dragDropDisabledWhileFilterHint: t("dragDropDisabledWhileFilterHint"),
          cancel: t("action.cancel"),
          directoryCreateLabel: t("action.new"),
          newChild: t("action.newChild"),
          newSibling: t("action.newSibling"),
          delete: t("action.delete"),
          undoDelete: t("action.undoDelete"),
          save: t("action.save"),
          saving: t("action.saving"),
          moveUp: t("action.moveUp"),
          moveDown: t("action.moveDown"),
          readOnlyNotice: t("readOnlyNotice"),
          loadError: t("error.load"),
          moveError: t("error.move"),
          validationError: t("error.validation"),
          discardConfirm: t("discardConfirm")
        }}
      />
    </Suspense>
  );
}
