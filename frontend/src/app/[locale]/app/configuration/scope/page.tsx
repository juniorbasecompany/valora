import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { ScopeConfigurationClient } from "@/component/configuration/scope-configuration-client";
import { getTenantScopeDirectory } from "@/lib/auth/server-session";

type ScopeConfigurationPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function ScopeConfigurationPage({
  params
}: ScopeConfigurationPageProps) {
  const { locale } = await params;
  const scopeDirectory = await getTenantScopeDirectory();

  if (!scopeDirectory) {
    redirect(`/${locale}/login?reason=auth_required`);
  }

  const t = await getTranslations("ScopeConfigurationPage");
  const tState = await getTranslations("State");

  const copy = {
    title: t("title"),
    description: t("description"),
    statusTitle: t("status.title"),
    statusDescription: t("status.description"),
    tabGeneral: t("tab.general"),
    tabHistory: t("tab.history"),
    tabListAriaLabel: t("tab.listAriaLabel"),
    listTitle: t("list.title"),
    listDescription: t("list.description"),
    empty: t("list.empty"),
    historyTitle: t("history.title"),
    historyDescription: t("history.description"),
    sectionIdentityTitle: t("section.identity.title"),
    sectionIdentityDescription: t("section.identity.description"),
    nameLabel: t("section.identity.nameLabel"),
    nameHint: t("section.identity.nameHint"),
    displayNameLabel: t("section.identity.displayNameLabel"),
    displayNameHint: t("section.identity.displayNameHint"),
    metadataIdLabel: t("metadata.idLabel"),
    cancel: t("action.cancel"),
    newScope: t("action.new"),
    delete: t("action.delete"),
    undoDelete: t("action.undoDelete"),
    save: t("action.save"),
    saving: t("action.saving"),
    readOnlyNotice: t("readOnlyNotice"),
    savedNotice: t("savedNotice"),
    createdNotice: t("createdNotice"),
    deletedNotice: t("deletedNotice"),
    saveError: t("error.save"),
    createError: t("error.create"),
    deleteError: t("error.delete"),
    validationError: t("error.validation"),
    discardConfirm: t("discardConfirm"),
    selectPrompt: t("selectPrompt")
  };

  return (
    <Suspense
      fallback={
        <div className="ui-panel ui-empty-panel">
          {tState("loadingDescription")}
        </div>
      }
    >
      <ScopeConfigurationClient
        locale={locale}
        initialDirectory={scopeDirectory}
        copy={copy}
      />
    </Suspense>
  );
}
