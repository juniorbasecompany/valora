import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { ItemConfigurationClient } from "@/component/configuration/item-configuration-client";
import {
  getAuthSession,
  getTenantItemDirectory,
  getTenantScopeDirectory
} from "@/lib/auth/server-session";

type ItemConfigurationPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function ItemConfigurationPage({
  params
}: ItemConfigurationPageProps) {
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
  const itemDirectory =
    currentScope != null ? await getTenantItemDirectory(currentScope.id) : null;

  const t = await getTranslations("ItemConfigurationPage");
  const tState = await getTranslations("State");

  return (
    <Suspense
      fallback={
        <div className="ui-panel ui-empty-panel">
          {tState("loadingDescription")}
        </div>
      }
    >
      <ItemConfigurationClient
        locale={locale}
        currentScope={currentScope}
        hasAnyScope={scopeDirectory.item_list.length > 0}
        initialItemDirectory={itemDirectory}
        copy={{
          title: t("title"),
          description: t("description"),
          emptyScope: t("list.emptyScope"),
          missingCurrentScope: t("list.missingCurrentScope"),
          historyTitle: t("history.title"),
          historyDescription: t("history.description"),
          filterSearchLabel: t("filter.searchLabel"),
          filterToggleAriaLabel: t("filter.toggleAriaLabel"),
          filterToggleLabel: t("filter.toggleLabel"),
          nameLabel: t("section.identity.nameLabel"),
          nameHint: t("section.identity.nameHint"),
          kindSelectLabel: t("section.kind.selectLabel"),
          kindSelectHint: t("section.kind.selectHint"),
          kindSelectPlaceholder: t("section.kind.selectPlaceholder"),
          kindOpenListAriaLabel: t("section.kind.openListAriaLabel"),
          kindAddAriaLabel: t("section.kind.addAriaLabel"),
          kindCreateError: t("section.kind.createError"),
          kindDeleteAriaLabel: t("section.kind.deleteAriaLabel"),
          kindDeleteError: t("section.kind.deleteError"),
          validationErrorKind: t("error.validationKind"),
          dragHandleAria: t("dragHandleAria"),
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
