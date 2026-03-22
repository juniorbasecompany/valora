import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { MemberConfigurationClient } from "@/component/configuration/member-configuration-client";
import { getTenantMemberDirectory } from "@/lib/auth/server-session";

type MemberConfigurationPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function MemberConfigurationPage({
  params
}: MemberConfigurationPageProps) {
  const { locale } = await params;
  const memberDirectory = await getTenantMemberDirectory();

  if (!memberDirectory) {
    redirect(`/${locale}/login?reason=auth_required`);
  }

  const t = await getTranslations("MemberConfigurationPage");
  const tState = await getTranslations("State");

  const copy = {
    eyebrow: t("eyebrow"),
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
    sectionProfileTitle: t("section.profile.title"),
    sectionProfileDescription: t("section.profile.description"),
    displayNameLabel: t("section.profile.displayNameLabel"),
    displayNameHint: t("section.profile.displayNameHint"),
    nameLabel: t("section.profile.nameLabel"),
    nameHint: t("section.profile.nameHint"),
    sectionAccessTitle: t("section.access.title"),
    sectionAccessDescription: t("section.access.description"),
    emailLabel: t("section.access.emailLabel"),
    emailHint: t("section.access.emailHint"),
    roleLabel: t("section.access.roleLabel"),
    statusLabel: t("section.access.statusLabel"),
    accountLinked: t("section.access.accountLinked"),
    accountPending: t("section.access.accountPending"),
    accessManagedNotice: t("section.access.accessManagedNotice"),
    memberIdLabel: t("metadata.memberIdLabel"),
    accountIdLabel: t("metadata.accountIdLabel"),
    cancel: t("action.cancel"),
    delete: t("action.delete"),
    undoDelete: t("action.undoDelete"),
    save: t("action.save"),
    saving: t("action.saving"),
    readOnlyNotice: t("readOnlyNotice"),
    protectedRecordNotice: t("protectedRecordNotice"),
    savedNotice: t("savedNotice"),
    deletedNotice: t("deletedNotice"),
    deletePendingNotice: t("deletePendingNotice"),
    saveError: t("error.save"),
    deleteError: t("error.delete"),
    validationError: t("error.validation"),
    discardConfirm: t("discardConfirm"),
    selectPrompt: t("selectPrompt"),
    roleLabels: {
      master: t("role.master"),
      admin: t("role.admin"),
      member: t("role.member")
    },
    statusLabels: {
      ACTIVE: t("statusValue.ACTIVE"),
      PENDING: t("statusValue.PENDING"),
      DISABLED: t("statusValue.DISABLED")
    }
  };

  return (
    <Suspense
      fallback={
        <div className="ui-panel px-6 py-6 text-sm text-[var(--color-text-muted)]">
          {tState("loadingDescription")}
        </div>
      }
    >
      <MemberConfigurationClient
        locale={locale}
        initialDirectory={memberDirectory}
        copy={copy}
      />
    </Suspense>
  );
}
