"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  directoryEditorCanSubmitForDirectoryEditor,
  directoryEditorSaveDisabled
} from "@/component/configuration/configuration-directory-editor-policy";
import { ConfigurationDirectoryEditorShell } from "@/component/configuration/configuration-directory-editor-shell";
import { ConfigurationInfoSection } from "@/component/configuration/configuration-info-section";
import { ConfigurationNameField } from "@/component/configuration/configuration-name-field";
import { EditorPanelFlashOverlay } from "@/component/configuration/editor-panel-flash-overlay";
import { ConfigurationDirectoryCreateButton } from "@/component/configuration/configuration-directory-create-button";
import { ConfigurationDirectoryListToolbarRow } from "@/component/configuration/configuration-directory-list-toolbar-row";
import {
  DirectoryFilterCard,
  DirectoryFilterMultiSelectField,
  DirectoryFilterPanel,
  DirectoryFilterTextField
} from "@/component/configuration/directory-filter-panel";
import { TrashIconButton } from "@/component/ui/trash-icon-button";
import { useEditorPanelFlash } from "@/component/configuration/use-editor-panel-flash";
import { useEditorNewIntentGeneration } from "@/component/configuration/use-editor-new-intent-generation";
import { useFocusFirstEditorFieldAfterFlash } from "@/component/configuration/use-focus-first-editor-field-after-flash";
import { useConfigurationDirectoryFetchGeneration } from "@/component/configuration/use-configuration-directory-fetch-generation";
import { useReplaceConfigurationPath } from "@/component/configuration/use-replace-configuration-path";
import {
  applyConfigurationSelectionToWindowHistory,
  preferredSelectionKeyAfterEditSave,
  type ConfigurationSelectionKey
} from "@/lib/navigation/configuration-path";
import type {
  TenantMemberDirectoryResponse,
  TenantMemberRecord
} from "@/lib/auth/types";
import { parseErrorCode, parseErrorDetail } from "@/lib/api/parse-error-detail";

type MemberStatusKey = "ACTIVE" | "PENDING" | "DISABLED";

export type MemberConfigurationCopy = {
  title: string;
  description: string;
  empty: string;
  historyTitle: string;
  historyDescription: string;
  filterSearchLabel: string;
  filterToggleAriaLabel: string;
  filterToggleLabel: string;
  filterRoleLabel: string;
  filterStatusLabel: string;
  filterAll: string;
  nameLabel: string;
  nameHint: string;
  sectionAccessTitle: string;
  sectionAccessDescription: string;
  emailLabel: string;
  inviteEmailHint: string;
  memberEmailHint: string;
  roleLabel: string;
  statusLabel: string;
  accountLinked: string;
  accountPending: string;
  accountTopicLabel: string;
  cancel: string;
  directoryCreateLabel: string;
  delete: string;
  undoDelete: string;
  save: string;
  saving: string;
  readOnlyNotice: string;
  protectedRecordNotice: string;
  saveError: string;
  createError: string;
  deleteError: string;
  validationError: string;
  emailValidationError: string;
  discardConfirm: string;
  roleLabels: Record<"master" | "admin" | "member", string>;
  statusLabels: Record<MemberStatusKey, string>;
  inviteSendLabel: string;
  inviteSendSendingLabel: string;
  inviteSendErrorGeneric: string;
  inviteSendErrorByCode: Record<string, string>;
};

type MemberConfigurationClientProps = {
  locale: string;
  initialDirectory: TenantMemberDirectoryResponse;
  copy: MemberConfigurationCopy;
};

const memberStatusValueByKey: Record<MemberStatusKey, number> = {
  ACTIVE: 1,
  PENDING: 2,
  DISABLED: 3
};

function resolveMemberLabel(member: TenantMemberRecord) {
  return member.name?.trim() || member.email;
}

function normalizeStatusKey(raw: string): MemberStatusKey {
  if (raw === "ACTIVE" || raw === "PENDING" || raw === "DISABLED") {
    return raw;
  }

  return "DISABLED";
}

function parseSelectedMemberKey(raw: string | null): ConfigurationSelectionKey {
  if (!raw) {
    return null;
  }

  if (raw === "new") {
    return "new";
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return null;
  }

  return parsed;
}

/** Compatível com respostas sem `can_create` (backend antigo ou proxy em cache). */
function directoryAllowsMemberInvite(directory: TenantMemberDirectoryResponse): boolean {
  return directory.can_create ?? directory.can_edit;
}

function resolveSelectionFromPreferredKey(
  itemList: TenantMemberRecord[],
  preferredKey: ConfigurationSelectionKey,
  canCreate: boolean
): { isCreateMode: boolean; selectedMemberId: number | null } {
  if (preferredKey === "new") {
    return {
      isCreateMode: Boolean(canCreate),
      selectedMemberId: null
    };
  }

  if (typeof preferredKey === "number") {
    const id = itemList.find((item) => item.id === preferredKey)?.id ?? null;
    if (id != null) {
      return { isCreateMode: false, selectedMemberId: id };
    }
    /* ID da URL inexistente/removido: volta para novo (quando permitido), sem seleção automática. */
    return {
      isCreateMode: Boolean(canCreate),
      selectedMemberId: null
    };
  }

  /* Sem query explícita: inicia pronto para novo registro, sem apontar item existente. */
  return {
    isCreateMode: Boolean(canCreate),
    selectedMemberId: null
  };
}

function resolveMemberInviteSendError(
  payload: unknown,
  copy: Pick<
    MemberConfigurationCopy,
    "inviteSendErrorGeneric" | "inviteSendErrorByCode"
  >
): string {
  const code = parseErrorCode(payload);
  const detailMessage = parseErrorDetail(payload, null);

  /* O backend envia o motivo técnico (ex.: Resend) em detail.message para este código. */
  if (code === "member_invite_delivery_failed") {
    const mapped =
      copy.inviteSendErrorByCode[code] ?? copy.inviteSendErrorGeneric;
    if (detailMessage && detailMessage !== mapped) {
      return `${mapped}\n${detailMessage}`;
    }
    return mapped;
  }

  if (code) {
    const mapped = copy.inviteSendErrorByCode[code];
    if (mapped) {
      return mapped;
    }
  }
  return detailMessage ?? copy.inviteSendErrorGeneric;
}

export function MemberConfigurationClient({
  locale,
  initialDirectory,
  copy
}: MemberConfigurationClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tMemberPage = useTranslations("MemberConfigurationPage");
  const initialSearchMemberKey = parseSelectedMemberKey(searchParams.get("member"));
  const initialSelection = resolveSelectionFromPreferredKey(
    initialDirectory.item_list,
    initialSearchMemberKey,
    directoryAllowsMemberInvite(initialDirectory)
  );
  const initialSelectedMember =
    initialSelection.selectedMemberId == null
      ? null
      : (initialDirectory.item_list.find(
        (item) => item.id === initialSelection.selectedMemberId
      ) ?? null);

  const configurationPath = `/${locale}/app/configuration`;
  const memberPath = `/${locale}/app/configuration/member`;

  const replacePath = useCallback(
    (nextPath: string) => {
      router.replace(nextPath, { scroll: false });
    },
    [router]
  );

  const [directory, setDirectory] = useState(initialDirectory);
  const [isCreateMode, setIsCreateMode] = useState(initialSelection.isCreateMode);
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(
    initialSelection.selectedMemberId
  );
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteEmailError, setInviteEmailError] = useState<string | undefined>();
  const [memberEmail, setMemberEmail] = useState(initialSelectedMember?.email ?? "");
  const [memberEmailError, setMemberEmailError] = useState<string | undefined>();
  const [name, setName] = useState(initialSelectedMember?.name ?? "");
  const [baseline, setBaseline] = useState({
    name: initialSelectedMember?.name ?? "",
    inviteEmail: "",
    memberEmail: initialSelectedMember?.email ?? ""
  });
  const [fieldError, setFieldError] = useState<{
    name?: string;
  }>({});
  const [requestErrorMessage, setRequestErrorMessage] = useState<string | null>(null);
  const [footerNoticeMessage, setFooterNoticeMessage] = useState<string | null>(null);
  const [invitingMemberId, setInvitingMemberId] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeletePending, setIsDeletePending] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [filterQuery, setFilterQuery] = useState("");
  const [filterRoleAllIsSelected, setFilterRoleAllIsSelected] = useState(true);
  const [filterRoleValueList, setFilterRoleValueList] = useState<string[]>([]);
  const [filterStatusAllIsSelected, setFilterStatusAllIsSelected] = useState(true);
  const [filterStatusValueList, setFilterStatusValueList] = useState<string[]>([]);
  const editorPanelElementRef = useRef<HTMLDivElement | null>(null);
  const { newIntentGeneration, bumpNewIntent } = useEditorNewIntentGeneration();
  const selectedMemberKeyRef = useRef<ConfigurationSelectionKey>(
    initialSelection.isCreateMode
      ? "new"
      : initialSelection.selectedMemberId
  );
  const didMountFilterRef = useRef(false);
  const {
    bumpAfterProgrammaticSync,
    captureGenerationAtFetchStart,
    isFetchResultStale
  } = useConfigurationDirectoryFetchGeneration();

  const selectedMemberKey: ConfigurationSelectionKey = isCreateMode
    ? "new"
    : selectedMemberId;

  useReplaceConfigurationPath(
    memberPath,
    searchParams,
    replacePath,
    "member",
    selectedMemberKey
  );

  useEffect(() => {
    if (!footerNoticeMessage) {
      return;
    }
    const timerId = window.setTimeout(() => {
      setFooterNoticeMessage(null);
    }, 5000);
    return () => window.clearTimeout(timerId);
  }, [footerNoticeMessage]);

  const selectedMember = useMemo(() => {
    if (selectedMemberId == null) {
      return null;
    }
    return directory.item_list.find((item) => item.id === selectedMemberId) ?? null;
  }, [directory.item_list, selectedMemberId]);

  const editorFlashKey = useMemo(() => {
    if (isCreateMode) {
      return `new:${String(newIntentGeneration)}`;
    }

    if (!selectedMember) {
      return null;
    }

    return `id:${String(selectedMember.id)}:email:${selectedMember.email}:name:${selectedMember.name}`;
  }, [isCreateMode, newIntentGeneration, selectedMember]);

  const isEditorFlashActive = useEditorPanelFlash(editorPanelElementRef, editorFlashKey);
  useFocusFirstEditorFieldAfterFlash(
    editorPanelElementRef,
    isEditorFlashActive,
    isCreateMode || selectedMember != null
  );

  const syncFromDirectory = useCallback(
    (
      nextDirectory: TenantMemberDirectoryResponse,
      preferredKey?: ConfigurationSelectionKey
    ) => {
      const nextSelection = resolveSelectionFromPreferredKey(
        nextDirectory.item_list,
        preferredKey ?? null,
        directoryAllowsMemberInvite(nextDirectory)
      );
      const nextSelectedMember =
        nextSelection.selectedMemberId == null
          ? null
          : (nextDirectory.item_list.find(
            (item) => item.id === nextSelection.selectedMemberId
          ) ?? null);

      setDirectory(nextDirectory);
      setIsCreateMode(nextSelection.isCreateMode);
      setSelectedMemberId(nextSelection.selectedMemberId);
      setInviteEmail("");
      setInviteEmailError(undefined);
      const nextMemberEmail = nextSelection.isCreateMode
        ? ""
        : (nextSelectedMember?.email ?? "");
      setMemberEmail(nextMemberEmail);
      setMemberEmailError(undefined);
      setName(nextSelection.isCreateMode ? "" : (nextSelectedMember?.name ?? ""));
      setBaseline({
        name: nextSelection.isCreateMode ? "" : (nextSelectedMember?.name ?? ""),
        inviteEmail: "",
        memberEmail: nextMemberEmail
      });
      setFieldError({});
      setRequestErrorMessage(null);
      setFooterNoticeMessage(null);
      setIsDeletePending(false);

      /* Evita que o efeito de `initialDirectory` leia ref desatualizado e reverta modo criação. */
      selectedMemberKeyRef.current = nextSelection.isCreateMode
        ? "new"
        : nextSelection.selectedMemberId;

      return nextSelection;
    },
    []
  );

  const applySyncFromHandlers = useCallback(
    (nextDirectory: TenantMemberDirectoryResponse, preferredKey?: ConfigurationSelectionKey) => {
      const keyForUrl: ConfigurationSelectionKey =
        preferredKey ?? selectedMemberKeyRef.current;
      applyConfigurationSelectionToWindowHistory(memberPath, "member", keyForUrl);
      syncFromDirectory(nextDirectory, preferredKey);
      bumpAfterProgrammaticSync();
    },
    [bumpAfterProgrammaticSync, syncFromDirectory]
  );

  const handleChangeFilterRole = useCallback((next: {
    allIsSelected: boolean;
    selectedValueList: string[];
  }) => {
    setFilterRoleAllIsSelected(next.allIsSelected);
    setFilterRoleValueList(next.selectedValueList);
  }, []);

  const handleChangeFilterStatus = useCallback((next: {
    allIsSelected: boolean;
    selectedValueList: string[];
  }) => {
    setFilterStatusAllIsSelected(next.allIsSelected);
    setFilterStatusValueList(next.selectedValueList);
  }, []);

  const loadMemberDirectory = useCallback(async () => {
      const fetchGenerationAtStart = captureGenerationAtFetchStart();
      const query = new URLSearchParams();
      const normalizedQuery = filterQuery.trim();
      if (normalizedQuery) {
        query.set("q", normalizedQuery);
      }
      if (!filterRoleAllIsSelected) {
        query.set(
          "role_list",
          filterRoleValueList.length > 0 ? filterRoleValueList.join(",") : "__none__"
        );
      }
      if (!filterStatusAllIsSelected) {
        query.set(
          "status_list",
          filterStatusValueList.length > 0
            ? filterStatusValueList.join(",")
            : "__none__"
        );
      }

      try {
        const response = await fetch(
          `/api/auth/tenant/current/members?${query.toString()}`
        );
        const data: unknown = await response.json().catch(() => ({}));
        if (!response.ok) {
          setRequestErrorMessage(
            parseErrorDetail(data, copy.saveError) ?? copy.saveError
          );
          return;
        }
        if (isFetchResultStale(fetchGenerationAtStart)) {
          return;
        }
        syncFromDirectory(
          data as TenantMemberDirectoryResponse,
          selectedMemberKeyRef.current
        );
      } catch {
        setRequestErrorMessage(copy.saveError);
      }
    },
    [
      captureGenerationAtFetchStart,
      copy.saveError,
      filterQuery,
      filterRoleAllIsSelected,
      filterRoleValueList,
      filterStatusAllIsSelected,
      filterStatusValueList,
      isFetchResultStale,
      syncFromDirectory
    ]
  );

  useEffect(() => {
    if (!didMountFilterRef.current) {
      didMountFilterRef.current = true;
      return;
    }
    void loadMemberDirectory();
  }, [loadMemberDirectory]);

  const isDirty = useMemo(() => {
    if (isCreateMode) {
      return (
        inviteEmail.trim() !== baseline.inviteEmail.trim() ||
        name.trim() !== baseline.name.trim()
      );
    }

    return (
      memberEmail.trim().toLowerCase() !==
      baseline.memberEmail.trim().toLowerCase() ||
      name.trim() !== baseline.name.trim() ||
      isDeletePending
    );
  }, [
    baseline.inviteEmail,
    baseline.memberEmail,
    baseline.name,
    inviteEmail,
    isCreateMode,
    isDeletePending,
    memberEmail,
    name
  ]);

  const validateInviteEmail = useCallback(() => {
    const trimmed = inviteEmail.trim();
    if (!trimmed || !trimmed.includes("@")) {
      setInviteEmailError(copy.emailValidationError);
      return false;
    }
    setInviteEmailError(undefined);
    return true;
  }, [copy.emailValidationError, inviteEmail]);

  const validateMemberEmail = useCallback(() => {
    const trimmed = memberEmail.trim();
    if (!trimmed || !trimmed.includes("@")) {
      setMemberEmailError(copy.emailValidationError);
      return false;
    }
    setMemberEmailError(undefined);
    return true;
  }, [copy.emailValidationError, memberEmail]);

  const validate = useCallback(() => {
    setFieldError({});
    if (isCreateMode) {
      return validateInviteEmail();
    }
    return validateMemberEmail();
  }, [isCreateMode, validateInviteEmail, validateMemberEmail]);

  const handleStartCreate = useCallback(() => {
    if (!directoryAllowsMemberInvite(directory) || isSaving) {
      return;
    }

    bumpNewIntent();
    if (!isCreateMode) {
      setFooterNoticeMessage(null);
      setRequestErrorMessage(null);
      applySyncFromHandlers(directory, "new");
    }
  }, [applySyncFromHandlers, bumpNewIntent, directory, isCreateMode, isSaving]);

  const handleSendMemberInvite = useCallback(
    async (item: TenantMemberRecord) => {
      if (!directoryAllowsMemberInvite(directory) || isSaving) {
        return;
      }

      const memberId = item.id;
      if (!Number.isInteger(memberId) || memberId < 1) {
        return;
      }

      setFooterNoticeMessage(null);
      setRequestErrorMessage(null);
      setInvitingMemberId(memberId);
      try {
        const response = await fetch(
          `/api/auth/tenant/current/members/${String(memberId)}/invite`,
          {
            method: "POST",
            headers: {
              "X-Valora-Invite-Email-Locale": locale
            }
          }
        );
        const data: unknown = await response.json().catch(() => ({}));

        if (!response.ok) {
          setRequestErrorMessage(resolveMemberInviteSendError(data, copy));
          return;
        }

        const emailRaw = (data as { email?: unknown }).email;
        const email =
          typeof emailRaw === "string" && emailRaw.trim()
            ? emailRaw.trim()
            : item.email;

        setRequestErrorMessage(null);
        setFooterNoticeMessage(tMemberPage("inviteSend.successNotice", { email }));
      } catch {
        setRequestErrorMessage(copy.inviteSendErrorGeneric);
        setFooterNoticeMessage(null);
      } finally {
        setInvitingMemberId(null);
      }
    },
    [copy, directory, isSaving, locale, tMemberPage]
  );

  const handleSelectMember = useCallback(
    (member: TenantMemberRecord) => {
      if (!isCreateMode && member.id === selectedMemberId) {
        return;
      }

      setFooterNoticeMessage(null);
      setRequestErrorMessage(null);
      applySyncFromHandlers(directory, member.id);
    },
    [
      applySyncFromHandlers,
      directory,
      isCreateMode,
      selectedMemberId
    ]
  );

  const handleToggleDelete = useCallback(() => {
    if (isSaving) {
      return;
    }

    setRequestErrorMessage(null);
    setIsDeletePending((previous) => !previous);
  }, [isSaving]);

  const handleSave = useCallback(async () => {
    setRequestErrorMessage(null);
    setFooterNoticeMessage(null);

    if (!isDeletePending && !validate()) {
      return;
    }

    setIsSaving(true);
    try {
      if (isCreateMode) {
        const response = await fetch("/api/auth/tenant/current/members", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: inviteEmail.trim(),
            name: name.trim()
          })
        });
        const data: unknown = await response.json().catch(() => ({}));

        if (!response.ok) {
          setRequestErrorMessage(
            parseErrorDetail(data, copy.createError) ?? copy.createError
          );
          return;
        }

        const updatedDirectory = data as TenantMemberDirectoryResponse;
        bumpNewIntent();
        applySyncFromHandlers(updatedDirectory, "new");
        setHistoryRefreshKey((previous) => previous + 1);
        return;
      }

      if (!selectedMember) {
        return;
      }

      const memberId = selectedMember.id;
      if (!Number.isInteger(memberId) || memberId < 1) {
        setRequestErrorMessage(copy.saveError);
        return;
      }

      const response = await fetch(
        `/api/auth/tenant/current/members/${String(memberId)}`,
        isDeletePending
          ? {
            method: "DELETE"
          }
          : {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: memberEmail.trim(),
              name: name.trim(),
              role: selectedMember.role,
              status: memberStatusValueByKey[
                normalizeStatusKey(selectedMember.status)
              ]
            })
          }
      );
      const data: unknown = await response.json().catch(() => ({}));

      if (!response.ok) {
        setRequestErrorMessage(
          parseErrorDetail(data, isDeletePending ? copy.deleteError : copy.saveError) ??
          (isDeletePending ? copy.deleteError : copy.saveError)
        );
        return;
      }

      const updatedDirectory = data as TenantMemberDirectoryResponse;
      if (isDeletePending) {
        const nextKey: ConfigurationSelectionKey = updatedDirectory.can_edit
          ? "new"
          : null;
        applySyncFromHandlers(updatedDirectory, nextKey);
      } else {
        bumpNewIntent();
        const nextPreferred = preferredSelectionKeyAfterEditSave(
          updatedDirectory.can_edit,
          selectedMember.id
        );
        applySyncFromHandlers(updatedDirectory, nextPreferred);
      }
      setHistoryRefreshKey((previous) => previous + 1);
    } catch {
      setRequestErrorMessage(
        isCreateMode
          ? copy.createError
          : isDeletePending
            ? copy.deleteError
            : copy.saveError
      );
    } finally {
      setIsSaving(false);
    }
  }, [
    applySyncFromHandlers,
    bumpNewIntent,
    copy.createError,
    copy.deleteError,
    copy.saveError,
    inviteEmail,
    isCreateMode,
    isDeletePending,
    memberEmail,
    name,
    selectedMember,
    validate
  ]);

  const accessRoleText = useMemo(() => {
    if (!selectedMember) {
      return "";
    }

    return (
      copy.roleLabels[selectedMember.role_name as keyof typeof copy.roleLabels] ??
      selectedMember.role_name
    );
  }, [copy.roleLabels, selectedMember]);

  const accessStatusText = useMemo(() => {
    if (!selectedMember) {
      return "";
    }

    const key = normalizeStatusKey(selectedMember.status);
    return copy.statusLabels[key];
  }, [copy.statusLabels, selectedMember]);

  const canInviteMember = directoryAllowsMemberInvite(directory);

  const recordCanEdit =
    selectedMember == null
      ? false
      : (selectedMember.can_edit ?? directory.can_edit);

  const canEditForm = isCreateMode ? canInviteMember : recordCanEdit;

  const canSubmit = directoryEditorCanSubmitForDirectoryEditor({
    isCreateMode,
    isDeletePending,
    canCreate: canInviteMember,
    canEdit: recordCanEdit
  });

  const footerErrorMessage =
    requestErrorMessage ??
    fieldError.name ??
    memberEmailError ??
    inviteEmailError ??
    null;

  const showAsideEmptyPanel = directory.item_list.length === 0 && !canInviteMember;

  /* Com baseline igual ao servidor (ex.: nome vazio), isDirty fica false e o Salvar travava sem necessidade. */
  const saveDirtyGate =
    isDirty ||
    (!isCreateMode && !isDeletePending && selectedMember != null);

  const hasMemberEditorContext = isCreateMode || selectedMember != null;

  return (
    <ConfigurationDirectoryEditorShell
      headerTitle={copy.title}
      headerDescription={copy.description}
      filter={{
        panel: (
          <DirectoryFilterPanel>
            <DirectoryFilterCard>
              <DirectoryFilterTextField
                id="member-filter-search"
                label={copy.filterSearchLabel}
                value={filterQuery}
                onChange={setFilterQuery}
              />
            </DirectoryFilterCard>
            <DirectoryFilterCard>
              <DirectoryFilterMultiSelectField
                id="member-filter-role"
                label={copy.filterRoleLabel}
                allIsSelected={filterRoleAllIsSelected}
                selectedValueList={filterRoleValueList}
                onChange={handleChangeFilterRole}
                allLabel={copy.filterAll}
                optionList={[
                  { value: "master", label: copy.roleLabels.master },
                  { value: "admin", label: copy.roleLabels.admin },
                  { value: "member", label: copy.roleLabels.member }
                ]}
              />
            </DirectoryFilterCard>
            <DirectoryFilterCard>
              <DirectoryFilterMultiSelectField
                id="member-filter-status"
                label={copy.filterStatusLabel}
                allIsSelected={filterStatusAllIsSelected}
                selectedValueList={filterStatusValueList}
                onChange={handleChangeFilterStatus}
                allLabel={copy.filterAll}
                optionList={[
                  { value: "active", label: copy.statusLabels.ACTIVE },
                  { value: "pending", label: copy.statusLabels.PENDING },
                  { value: "disabled", label: copy.statusLabels.DISABLED }
                ]}
              />
            </DirectoryFilterCard>
          </DirectoryFilterPanel>
        ),
        storageSegment: "member"
      }}
      editorPanelRef={editorPanelElementRef}
      isDeletePending={isDeletePending}
      directoryAside={
        <>
          {!directory.can_edit ? (
            <div className="ui-notice-attention ui-notice-block">
              {copy.readOnlyNotice}
            </div>
          ) : null}

          <div className="ui-directory-list">
            <ConfigurationDirectoryListToolbarRow
              showFilterToggle
              filterSegment="member"
              filterToggleAriaLabel={copy.filterToggleAriaLabel}
              filterToggleLabel={copy.filterToggleLabel}
              end={
                canInviteMember ? (
                  <ConfigurationDirectoryCreateButton
                    label={copy.directoryCreateLabel}
                    active={isCreateMode}
                    disabled={isSaving}
                    onClick={handleStartCreate}
                    wrapInToolbar={false}
                  />
                ) : null
              }
            />

            {directory.item_list.map((item) => {
              const showInviteSendAction =
                canInviteMember &&
                item.account_id == null &&
                item.status === "PENDING";

              return (
                <div key={item.id} className="ui-directory-row">
                  <button
                    type="button"
                    onClick={() => handleSelectMember(item)}
                    className="ui-directory-item"
                    style={{ flex: "1 1 auto", minWidth: 0 }}
                    data-selected={item.id === selectedMember?.id ? "true" : undefined}
                    data-delete-pending={
                      item.id === selectedMember?.id && isDeletePending
                        ? "true"
                        : undefined
                    }
                  >
                    <div className="ui-min-w-0">
                      <p className="ui-directory-title">
                        {resolveMemberLabel(item)}
                      </p>
                      <p className="ui-directory-caption">{item.email}</p>
                    </div>
                  </button>
                  {showInviteSendAction ? (
                    <button
                      type="button"
                      className="ui-button-secondary"
                      style={{
                        flex: "0 0 auto",
                        alignSelf: "center",
                        whiteSpace: "nowrap"
                      }}
                      aria-label={tMemberPage("inviteSend.sendInviteAriaLabel", {
                        email: item.email
                      })}
                      disabled={isSaving || invitingMemberId != null}
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleSendMemberInvite(item);
                      }}
                    >
                      {invitingMemberId === item.id
                        ? copy.inviteSendSendingLabel
                        : copy.inviteSendLabel}
                    </button>
                  ) : null}
                </div>
              );
            })}

            {showAsideEmptyPanel ? (
              <div className="ui-panel ui-empty-panel ui-panel-body-compact">
                {copy.empty}
              </div>
            ) : null}
          </div>
        </>
      }
      editorForm={
        <>
          {!isCreateMode &&
            directory.can_edit &&
            selectedMember &&
            !selectedMember.can_edit ? (
            <div className="ui-notice-attention ui-notice-block">
              {copy.protectedRecordNotice}
            </div>
          ) : null}

          {isCreateMode || selectedMember ? (
            <section className="ui-card ui-form-section ui-border-accent">
              <EditorPanelFlashOverlay active={isEditorFlashActive} />
              <div className="ui-editor-content">
                <div className="ui-field">
                  {isCreateMode ? (
                    <>
                      <label className="ui-field-label" htmlFor="member-invite-email">
                        {copy.emailLabel}
                      </label>
                      <input
                        id="member-invite-email"
                        type="email"
                        className="ui-input"
                        data-editor-primary-field="true"
                        value={inviteEmail}
                        onChange={(event) => {
                          setInviteEmail(event.target.value);
                          setInviteEmailError(undefined);
                          setRequestErrorMessage(null);
                        }}
                        disabled={isSaving || !canEditForm}
                        autoComplete="email"
                        aria-invalid={Boolean(inviteEmailError)}
                      />
                      <p className="ui-field-hint">{copy.inviteEmailHint}</p>
                      {inviteEmailError ? (
                        <p className="ui-field-error">{inviteEmailError}</p>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <label className="ui-field-label" htmlFor="member-email">
                        {copy.emailLabel}
                      </label>
                      <input
                        id="member-email"
                        type="email"
                        className="ui-input"
                        data-editor-primary-field="true"
                        value={memberEmail}
                        onChange={(event) => {
                          setMemberEmail(event.target.value);
                          setMemberEmailError(undefined);
                          setRequestErrorMessage(null);
                        }}
                        disabled={isDeletePending || !canEditForm}
                        autoComplete="email"
                        aria-invalid={Boolean(memberEmailError)}
                      />
                      <p className="ui-field-hint">{copy.memberEmailHint}</p>
                      {memberEmailError ? (
                        <p className="ui-field-error">{memberEmailError}</p>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            </section>
          ) : null}

          <ConfigurationNameField
            inputId="member-name"
            name={name}
            setName={setName}
            setFieldError={setFieldError}
            fieldError={fieldError}
            disabled={isDeletePending || !canEditForm}
            label={copy.nameLabel}
            hint={copy.nameHint}
            onAfterFieldEdit={() => setRequestErrorMessage(null)}
            multiline
          />

          {!isCreateMode && selectedMember ? (
            <>
              <ConfigurationInfoSection
                title={copy.sectionAccessTitle}
                description={copy.sectionAccessDescription}
              >
                <ul className="ui-info-topic-list">
                  <li>
                    <p className="ui-info-topic-lead">
                      <span className="ui-info-topic-label">
                        {copy.accountTopicLabel}
                      </span>
                      {": "}
                      <span className="ui-info-topic-value">
                        {selectedMember.account_id
                          ? copy.accountLinked
                          : copy.accountPending}
                      </span>
                    </p>
                  </li>
                  <li>
                    <p className="ui-info-topic-lead">
                      <span className="ui-info-topic-label">
                        {copy.roleLabel}
                      </span>
                      {": "}
                      <span className="ui-info-topic-value">
                        {accessRoleText}
                      </span>
                    </p>
                  </li>
                  <li>
                    <p className="ui-info-topic-lead">
                      <span className="ui-info-topic-label">
                        {copy.statusLabel}
                      </span>
                      {": "}
                      <span className="ui-info-topic-value">
                        {accessStatusText}
                      </span>
                    </p>
                  </li>
                </ul>
              </ConfigurationInfoSection>
            </>
          ) : null}

        </>
      }
      history={{
        headingId: "member-history-heading",
        title: copy.historyTitle,
        description: copy.historyDescription,
        tableName: "member",
        refreshKey: historyRefreshKey
      }}
      footer={{
        configurationPath,
        cancelLabel: copy.cancel,
        discardConfirm: copy.discardConfirm,
        isDirty,
        footerErrorMessage,
        footerNoticeMessage,
        onSave: () => void handleSave(),
        saveDisabled: directoryEditorSaveDisabled({
          hasEditableContext: hasMemberEditorContext,
          canSubmit,
          isSaving,
          isDirty: saveDirtyGate
        }),
        saveLabel: copy.save,
        savingLabel: copy.saving,
        isSaving,
        dangerAction:
          !isCreateMode && selectedMember ? (
            <TrashIconButton
              marked={isDeletePending}
              ariaLabel={isDeletePending ? copy.undoDelete : copy.delete}
              disabled={isSaving}
              onClick={handleToggleDelete}
            />
          ) : null
      }}
    />
  );
}
