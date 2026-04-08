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
    title: t("title"),
    description: t("description"),
    empty: t("list.empty"),
    historyTitle: t("history.title"),
    historyDescription: t("history.description"),
    filterSearchLabel: t("filter.searchLabel"),
    filterToggleAriaLabel: t("filter.toggleAriaLabel"),
    filterToggleLabel: t("filter.toggleLabel"),
    filterRoleLabel: t("filter.roleLabel"),
    filterStatusLabel: t("filter.statusLabel"),
    filterAll: t("filter.all"),
    nameLabel: t("section.profile.nameLabel"),
    nameHint: t("section.profile.nameHint"),
    sectionAccessTitle: t("section.access.title"),
    sectionAccessDescription: t("section.access.description"),
    emailLabel: t("section.access.emailLabel"),
    inviteEmailHint: t("section.invite.emailFieldHint"),
    memberEmailHint: t("section.access.memberEmailHint"),
    roleLabel: t("section.access.roleLabel"),
    statusLabel: t("section.access.statusLabel"),
    accountLinked: t("section.access.accountLinked"),
    accountPending: t("section.access.accountPending"),
    accountTopicLabel: t("section.access.accountTopicLabel"),
    cancel: t("action.cancel"),
    directoryCreateLabel: t("action.new"),
    delete: t("action.delete"),
    undoDelete: t("action.undoDelete"),
    save: t("action.save"),
    saving: t("action.saving"),
    readOnlyNotice: t("readOnlyNotice"),
    protectedRecordNotice: t("protectedRecordNotice"),
    saveError: t("error.save"),
    createError: t("error.create"),
    deleteError: t("error.delete"),
    validationError: t("error.validation"),
    emailValidationError: t("error.emailValidation"),
    discardConfirm: t("discardConfirm"),
    roleLabels: {
      master: t("role.master"),
      admin: t("role.admin"),
      member: t("role.member")
    },
    statusLabels: {
      ACTIVE: t("statusValue.ACTIVE"),
      PENDING: t("statusValue.PENDING"),
      DISABLED: t("statusValue.DISABLED")
    },
    inviteSendLabel: t("inviteSend.sendInvite"),
    inviteSendSendingLabel: t("inviteSend.sending"),
    inviteSendErrorGeneric: t("inviteSend.error.generic"),
    inviteSendErrorByCode: {
      member_invite_forbidden: t("inviteSend.error.member_invite_forbidden"),
      member_invite_not_found: t("inviteSend.error.member_invite_not_found"),
      member_invite_already_linked: t("inviteSend.error.member_invite_already_linked"),
      member_invite_invalid_status: t("inviteSend.error.member_invite_invalid_status"),
      member_invite_no_email: t("inviteSend.error.member_invite_no_email"),
      member_invite_delivery_failed: t("inviteSend.error.member_invite_delivery_failed")
    }
  };

  return (
    <Suspense
      fallback={
        <div className="ui-panel ui-empty-panel">
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
