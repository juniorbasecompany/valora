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
    eyebrow: t("eyebrow"),
    title: t("title"),
    description: t("description"),
    statusTitle: t("status.title"),
    statusDescription: t("status.description"),
    historyTitle: t("history.title"),
    historyDescription: t("history.description"),
    sectionDisplayTitle: t("section.display.title"),
    sectionDisplayDescription: t("section.display.description"),
    displayNameLabel: t("section.display.nameLabel"),
    displayNameHint: t("section.display.nameHint"),
    sectionLegalTitle: t("section.legal.title"),
    sectionLegalDescription: t("section.legal.description"),
    legalNameLabel: t("section.legal.nameLabel"),
    legalNameHint: t("section.legal.nameHint"),
    metadataIdLabel: t("metadata.idLabel"),
    cancel: t("action.cancel"),
    delete: t("action.delete"),
    undoDelete: t("action.undoDelete"),
    save: t("action.save"),
    saving: t("action.saving"),
    back: t("action.back"),
    readOnlyNotice: t("readOnlyNotice"),
    savedNotice: t("savedNotice"),
    saveError: t("error.save"),
    deleteError: t("error.delete"),
    validationError: t("error.validation"),
    discardConfirm: t("discardConfirm")
  };

  return (
    <Suspense
      fallback={
        <div className="ui-panel px-6 py-6 text-sm text-[var(--color-text-muted)]">
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
