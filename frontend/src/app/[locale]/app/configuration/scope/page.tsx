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
    filterSearchLabel: t("filter.searchLabel"),
    filterToggleAriaLabel: t("filter.toggleAriaLabel"),
    filterToggleLabel: t("filter.toggleLabel"),
    nameLabel: t("section.identity.nameLabel"),
    nameHint: t("section.identity.nameHint"),
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
    validationError: t("error.validation"),
    discardConfirm: t("discardConfirm")
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
