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
    empty: t("empty"),
    historyTitle: t("history.title"),
    historyDescription: t("history.description"),
    nameLabel: t("section.identity.nameLabel"),
    nameHint: t("section.identity.nameHint"),
    displayNameLabel: t("section.identity.displayNameLabel"),
    displayNameHint: t("section.identity.displayNameHint"),
    sectionInfoTitle: t("section.info.title"),
    sectionInfoDescription: t("section.info.description"),
    infoIdLabel: t("section.info.idLabel"),
    infoNameRegisteredLabel: t("section.info.nameRegisteredLabel"),
    infoDisplayRegisteredLabel: t("section.info.displayRegisteredLabel"),
    infoCanEditLabel: t("section.info.canEditLabel"),
    infoCanDeleteLabel: t("section.info.canDeleteLabel"),
    infoYes: t("section.info.yes"),
    infoNo: t("section.info.no"),
    infoCreateLead: t("section.info.createLead"),
    infoCreateHint: t("section.info.createHint"),
    cancel: t("action.cancel"),
    newScope: t("action.new"),
    delete: t("action.delete"),
    undoDelete: t("action.undoDelete"),
    save: t("action.save"),
    saving: t("action.saving"),
    readOnlyNotice: t("readOnlyNotice"),
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
