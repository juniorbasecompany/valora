import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { LocationConfigurationClient } from "@/component/configuration/location-configuration-client";
import {
  getTenantLocationDirectory,
  getTenantScopeDirectory
} from "@/lib/auth/server-session";

type LocationConfigurationPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ scope?: string }>;
};

export default async function LocationConfigurationPage({
  params,
  searchParams
}: LocationConfigurationPageProps) {
  const { locale } = await params;
  const scopeDirectory = await getTenantScopeDirectory();

  if (!scopeDirectory) {
    redirect(`/${locale}/login?reason=auth_required`);
  }

  const resolvedSearchParams = await searchParams;
  const requestedScopeId = Number(resolvedSearchParams.scope);
  const selectedScopeId =
    scopeDirectory.item_list.find((item) => item.id === requestedScopeId)?.id ??
    scopeDirectory.item_list[0]?.id ??
    null;
  const locationDirectory =
    selectedScopeId != null ? await getTenantLocationDirectory(selectedScopeId) : null;

  const t = await getTranslations("LocationConfigurationPage");
  const tState = await getTranslations("State");

  return (
    <Suspense
      fallback={
        <div className="ui-panel px-6 py-6 text-sm text-[var(--color-text-muted)]">
          {tState("loadingDescription")}
        </div>
      }
    >
      <LocationConfigurationClient
        locale={locale}
        initialScopeDirectory={scopeDirectory}
        initialLocationDirectory={locationDirectory}
        copy={{
          eyebrow: t("eyebrow"),
          title: t("title"),
          description: t("description"),
          statusTitle: t("status.title"),
          statusDescription: t("status.description"),
          tabGeneral: t("tab.general"),
          tabHistory: t("tab.history"),
          tabListAriaLabel: t("tab.listAriaLabel"),
          scopeLabel: t("scope.label"),
          scopeHint: t("scope.hint"),
          listTitle: t("list.title"),
          listDescription: t("list.description"),
          empty: t("list.empty"),
          emptyScope: t("list.emptyScope"),
          treeSearchLabel: t("tree.searchLabel"),
          treeSearchPlaceholder: t("tree.searchPlaceholder"),
          historyTitle: t("history.title"),
          historyDescription: t("history.description"),
          sectionIdentityTitle: t("section.identity.title"),
          sectionIdentityDescription: t("section.identity.description"),
          nameLabel: t("section.identity.nameLabel"),
          nameHint: t("section.identity.nameHint"),
          displayNameLabel: t("section.identity.displayNameLabel"),
          displayNameHint: t("section.identity.displayNameHint"),
          parentLabel: t("section.structure.parentLabel"),
          parentHint: t("section.structure.parentHint"),
          rootOptionLabel: t("section.structure.rootOptionLabel"),
          parentSearchLabel: t("section.structure.parentSearchLabel"),
          parentSearchPlaceholder: t("section.structure.parentSearchPlaceholder"),
          noParentCandidates: t("section.structure.noParentCandidates"),
          sectionStructureTitle: t("section.structure.title"),
          sectionStructureDescription: t("section.structure.description"),
          metadataIdLabel: t("metadata.idLabel"),
          metadataPathLabel: t("metadata.pathLabel"),
          metadataChildrenLabel: t("metadata.childrenLabel"),
          metadataDescendantsLabel: t("metadata.descendantsLabel"),
          dragDropHint: t("dragDropHint"),
          reorderTitle: t("reorder.title"),
          reorderDescription: t("reorder.description"),
          cancel: t("action.cancel"),
          newRoot: t("action.newRoot"),
          newChild: t("action.newChild"),
          newSibling: t("action.newSibling"),
          delete: t("action.delete"),
          undoDelete: t("action.undoDelete"),
          save: t("action.save"),
          saving: t("action.saving"),
          moveUp: t("action.moveUp"),
          moveDown: t("action.moveDown"),
          moving: t("action.moving"),
          moveToRoot: t("action.moveToRoot"),
          selectPrompt: t("selectPrompt"),
          readOnlyNotice: t("readOnlyNotice"),
          savedNotice: t("savedNotice"),
          createdNotice: t("createdNotice"),
          deletedNotice: t("deletedNotice"),
          movedNotice: t("movedNotice"),
          loadError: t("error.load"),
          saveError: t("error.save"),
          createError: t("error.create"),
          deleteError: t("error.delete"),
          moveError: t("error.move"),
          validationError: t("error.validation"),
          discardConfirm: t("discardConfirm"),
          childDeleteBlocked: t("childDeleteBlocked"),
          moveBlocked: t("moveBlocked"),
          newLocationTitle: t("newLocationTitle"),
          dropBefore: t("drop.before"),
          dropInside: t("drop.inside"),
          dropAfter: t("drop.after")
        }}
      />
    </Suspense>
  );
}
