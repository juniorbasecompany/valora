import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { TenantConfigurationClient } from "@/component/configuration/tenant-configuration-client";
import { getTenantCurrentDetail } from "@/lib/auth/server-session";

type TenantConfigurationPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function TenantConfigurationPage({
  params
}: TenantConfigurationPageProps) {
  const { locale } = await params;
  const tenantDetail = await getTenantCurrentDetail();

  if (!tenantDetail) {
    redirect(`/${locale}/login?reason=auth_required`);
  }

  const t = await getTranslations("TenantConfigurationPage");
  const tState = await getTranslations("State");

  const copy = {
    title: t("title"),
    description: t("description"),
    emptyEditor: t("editor.selectToEdit"),
    directoryCreateLabel: t("action.new"),
    historyTitle: t("history.title"),
    historyDescription: t("history.description"),
    filterSearchLabel: t("filter.searchLabel"),
    filterToggleAriaLabel: t("filter.toggleAriaLabel"),
    filterToggleLabel: t("filter.toggleLabel"),
    filterEmpty: t("filter.empty"),
    nameLabel: t("section.name.nameLabel"),
    nameHint: t("section.name.nameHint"),
    cancel: t("action.cancel"),
    delete: t("action.delete"),
    undoDelete: t("action.undoDelete"),
    save: t("action.save"),
    saving: t("action.saving"),
    readOnlyNotice: t("readOnlyNotice"),
    saveError: t("error.save"),
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
      <TenantConfigurationClient
        locale={locale}
        initialTenant={tenantDetail}
        copy={copy}
      />
    </Suspense>
  );
}
