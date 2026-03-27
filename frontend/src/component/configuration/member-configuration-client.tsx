"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
    directoryEditorCanSubmitForDirectoryEditor,
    directoryEditorSaveDisabled
} from "@/component/configuration/configuration-directory-editor-policy";
import { ConfigurationDirectoryEditorShell } from "@/component/configuration/configuration-directory-editor-shell";
import { ConfigurationInfoSection } from "@/component/configuration/configuration-info-section";
import { ConfigurationNameDisplayNameFields } from "@/component/configuration/configuration-name-display-name-fields";
import { EditorPanelFlashOverlay } from "@/component/configuration/editor-panel-flash-overlay";
import { ConfigurationDirectoryCreateButton } from "@/component/configuration/configuration-directory-create-button";
import { useEditorPanelFlash } from "@/component/configuration/use-editor-panel-flash";
import { useReplaceConfigurationPath } from "@/component/configuration/use-replace-configuration-path";
import type { ConfigurationSelectionKey } from "@/lib/navigation/configuration-path";
import type {
    TenantMemberDirectoryResponse,
    TenantMemberRecord
} from "@/lib/auth/types";
import { parseErrorDetail } from "@/lib/api/parse-error-detail";

type MemberStatusKey = "ACTIVE" | "PENDING" | "DISABLED";

export type MemberConfigurationCopy = {
    title: string;
    description: string;
    empty: string;
    sectionIdleTitle: string;
    sectionIdleDescription: string;
    sectionIdleSelectLead: string;
    sectionIdleSelectHint: string;
    sectionIdleEmptyLead: string;
    sectionIdleEmptyHint: string;
    historyTitle: string;
    historyDescription: string;
    displayNameLabel: string;
    displayNameHint: string;
    nameLabel: string;
    nameHint: string;
    sectionAccessTitle: string;
    sectionAccessDescription: string;
    emailLabel: string;
    emailHint: string;
    roleLabel: string;
    statusLabel: string;
    accountLinked: string;
    accountPending: string;
    accountTopicLabel: string;
    inviteSectionTitle: string;
    inviteSectionDescription: string;
    inviteCreateLead: string;
    inviteCreateHint: string;
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
    return member.display_name?.trim() || member.name?.trim() || member.email;
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
        /* ID da URL inexistente ou removido: painel ocioso até nova escolha na lista. */
        return { isCreateMode: false, selectedMemberId: null };
    }

    /* Sem query explícita: painel de edição vazio (ocioso); convite só com ?member=new ou Novo. */
    return { isCreateMode: false, selectedMemberId: null };
}

function findMemberIdByEmailNormalized(
    itemList: TenantMemberRecord[],
    emailNormalized: string
): number | null {
    const target = emailNormalized.trim().toLowerCase();
    let best: TenantMemberRecord | null = null;
    for (const item of itemList) {
        if (item.email.trim().toLowerCase() !== target) {
            continue;
        }
        if (best == null || item.id > best.id) {
            best = item;
        }
    }
    return best?.id ?? null;
}

export function MemberConfigurationClient({
    locale,
    initialDirectory,
    copy
}: MemberConfigurationClientProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
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
    const [displayName, setDisplayName] = useState(
        initialSelectedMember?.display_name ?? ""
    );
    const [name, setName] = useState(initialSelectedMember?.name ?? "");
    const [baseline, setBaseline] = useState({
        displayName: initialSelectedMember?.display_name ?? "",
        name: initialSelectedMember?.name ?? "",
        inviteEmail: ""
    });
    const [fieldError, setFieldError] = useState<{
        displayName?: string;
        name?: string;
    }>({});
    const [requestErrorMessage, setRequestErrorMessage] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isDeletePending, setIsDeletePending] = useState(false);
    const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
    const editorPanelElementRef = useRef<HTMLDivElement | null>(null);
    const initialSearchMemberKeyRef = useRef<ConfigurationSelectionKey>(initialSearchMemberKey);
    const selectedMemberKeyRef = useRef<ConfigurationSelectionKey>(
        initialSelection.isCreateMode
            ? "new"
            : initialSelection.selectedMemberId
    );
    const didResolveInitialUrlRef = useRef(false);

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
        selectedMemberKeyRef.current = selectedMemberKey;
    }, [selectedMemberKey]);

    const selectedMember = useMemo(() => {
        if (selectedMemberId == null) {
            return null;
        }
        return directory.item_list.find((item) => item.id === selectedMemberId) ?? null;
    }, [directory.item_list, selectedMemberId]);

    const editorFlashKey = useMemo(() => {
        if (isCreateMode) {
            return "new";
        }

        if (!selectedMember) {
            return null;
        }

        return `id:${String(selectedMember.id)}:name:${selectedMember.name}:display:${selectedMember.display_name}`;
    }, [isCreateMode, selectedMember]);

    const isEditorFlashActive = useEditorPanelFlash(editorPanelElementRef, editorFlashKey);

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
            setDisplayName(
                nextSelection.isCreateMode ? "" : (nextSelectedMember?.display_name ?? "")
            );
            setName(nextSelection.isCreateMode ? "" : (nextSelectedMember?.name ?? ""));
            setBaseline({
                displayName: nextSelection.isCreateMode
                    ? ""
                    : (nextSelectedMember?.display_name ?? ""),
                name: nextSelection.isCreateMode ? "" : (nextSelectedMember?.name ?? ""),
                inviteEmail: ""
            });
            setFieldError({});
            setRequestErrorMessage(null);
            setIsDeletePending(false);

            /* Evita que o efeito de `initialDirectory` leia ref desatualizado e reverta modo criação. */
            selectedMemberKeyRef.current = nextSelection.isCreateMode
                ? "new"
                : nextSelection.selectedMemberId;

            return nextSelection;
        },
        []
    );

    useEffect(() => {
        const preferredKey = didResolveInitialUrlRef.current
            ? selectedMemberKeyRef.current
            : initialSearchMemberKeyRef.current;

        didResolveInitialUrlRef.current = true;
        syncFromDirectory(initialDirectory, preferredKey);
    }, [initialDirectory, syncFromDirectory]);

    const isDirty = useMemo(() => {
        if (isCreateMode) {
            return (
                inviteEmail.trim() !== baseline.inviteEmail.trim() ||
                displayName.trim() !== baseline.displayName.trim() ||
                name.trim() !== baseline.name.trim()
            );
        }

        return (
            displayName.trim() !== baseline.displayName.trim() ||
            name.trim() !== baseline.name.trim() ||
            isDeletePending
        );
    }, [
        baseline.displayName,
        baseline.inviteEmail,
        baseline.name,
        displayName,
        inviteEmail,
        isCreateMode,
        isDeletePending,
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

    const validate = useCallback(() => {
        setFieldError({});
        if (isCreateMode) {
            return validateInviteEmail();
        }
        return true;
    }, [isCreateMode, validateInviteEmail]);

    const handleStartCreate = useCallback(() => {
        if (!directoryAllowsMemberInvite(directory) || isSaving) {
            return;
        }

        if (isCreateMode) {
            return;
        }

        if (isDirty && !window.confirm(copy.discardConfirm)) {
            return;
        }

        syncFromDirectory(directory, "new");
    }, [copy.discardConfirm, directory, isCreateMode, isDirty, isSaving, syncFromDirectory]);

    const handleSelectMember = useCallback(
        (member: TenantMemberRecord) => {
            if (!isCreateMode && member.id === selectedMemberId) {
                return;
            }

            if (isDirty && !window.confirm(copy.discardConfirm)) {
                return;
            }

            syncFromDirectory(directory, member.id);
        },
        [
            copy.discardConfirm,
            directory,
            isCreateMode,
            isDirty,
            selectedMemberId,
            syncFromDirectory
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

        if (!isDeletePending && !validate()) {
            return;
        }

        setIsSaving(true);
        try {
            if (isCreateMode) {
                const emailNormalized = inviteEmail.trim().toLowerCase();
                const response = await fetch("/api/auth/tenant/current/members", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        email: inviteEmail.trim(),
                        name: name.trim(),
                        display_name: displayName.trim()
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
                const createdId = findMemberIdByEmailNormalized(
                    updatedDirectory.item_list,
                    emailNormalized
                );
                syncFromDirectory(updatedDirectory, createdId);
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
                              display_name: displayName.trim(),
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
            syncFromDirectory(updatedDirectory, selectedMember.id);
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
        copy.createError,
        copy.deleteError,
        copy.saveError,
        displayName,
        inviteEmail,
        isCreateMode,
        isDeletePending,
        name,
        selectedMember,
        syncFromDirectory,
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

    const canEditForm = isCreateMode ? canInviteMember : (selectedMember?.can_edit ?? false);

    const canSubmit = directoryEditorCanSubmitForDirectoryEditor({
        isCreateMode,
        isDeletePending,
        canCreate: canInviteMember,
        canEdit: selectedMember?.can_edit ?? false
    });

    const footerErrorMessage =
        requestErrorMessage ??
        fieldError.name ??
        fieldError.displayName ??
        inviteEmailError ??
        null;

    const hasMemberList = directory.item_list.length > 0;
    const showAsideEmptyPanel = directory.item_list.length === 0 && !canInviteMember;
    const idleEditorHasAction = hasMemberList || canInviteMember;

    return (
        <ConfigurationDirectoryEditorShell
            headerTitle={copy.title}
            headerDescription={copy.description}
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
                        {canInviteMember ? (
                            <ConfigurationDirectoryCreateButton
                                label={copy.directoryCreateLabel}
                                active={isCreateMode}
                                disabled={isSaving}
                                onClick={handleStartCreate}
                            />
                        ) : null}

                        {directory.item_list.map((item) => {
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => handleSelectMember(item)}
                                    className="ui-directory-item"
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

                    {isCreateMode ? (
                        <section className="ui-card ui-form-section ui-border-accent">
                            <EditorPanelFlashOverlay active={isEditorFlashActive} />
                            <div className="ui-editor-content">
                                <div className="ui-field">
                                    <label className="ui-field-label" htmlFor="member-invite-email">
                                        {copy.emailLabel}
                                    </label>
                                    <input
                                        id="member-invite-email"
                                        type="email"
                                        className="ui-input"
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
                                    <p className="ui-field-hint">{copy.emailHint}</p>
                                    {inviteEmailError ? (
                                        <p className="ui-field-error">{inviteEmailError}</p>
                                    ) : null}
                                </div>
                            </div>
                        </section>
                    ) : null}

                    {!isCreateMode && selectedMember ? (
                        <section className="ui-card ui-form-section ui-border-accent">
                            <EditorPanelFlashOverlay active={isEditorFlashActive} />
                            <div className="ui-editor-content">
                                <div className="ui-field">
                                    <label className="ui-field-label" htmlFor="member-email">
                                        {copy.emailLabel}
                                    </label>
                                    <input
                                        id="member-email"
                                        type="email"
                                        className="ui-input"
                                        value={selectedMember.email}
                                        readOnly
                                        disabled={isDeletePending || !selectedMember.can_edit}
                                        aria-readonly="true"
                                    />
                                    <p className="ui-field-hint">{copy.emailHint}</p>
                                </div>
                            </div>
                        </section>
                    ) : null}

                    <ConfigurationNameDisplayNameFields
                        nameInputId="member-name"
                        displayTextareaId="member-display-name"
                        name={name}
                        displayName={displayName}
                        setName={setName}
                        setDisplayName={setDisplayName}
                        setFieldError={setFieldError}
                        fieldError={fieldError}
                        disabled={isDeletePending || !canEditForm}
                        nameLabel={copy.nameLabel}
                        nameHint={copy.nameHint}
                        displayNameLabel={copy.displayNameLabel}
                        displayNameHint={copy.displayNameHint}
                        flashActive={
                            isEditorFlashActive && !isCreateMode && selectedMember == null
                        }
                        onAfterFieldEdit={() => setRequestErrorMessage(null)}
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

                    {isCreateMode ? (
                        <ConfigurationInfoSection
                            title={copy.inviteSectionTitle}
                            description={copy.inviteSectionDescription}
                        >
                            <ul className="ui-info-topic-list">
                                <li>
                                    <p className="ui-info-topic-lead">
                                        <span className="ui-info-topic-label">
                                            {copy.inviteCreateLead}
                                        </span>
                                    </p>
                                    <p className="ui-field-hint ui-info-topic-hint">
                                        {copy.inviteCreateHint}
                                    </p>
                                </li>
                            </ul>
                        </ConfigurationInfoSection>
                    ) : null}

                    {!isCreateMode && selectedMember == null ? (
                        <ConfigurationInfoSection
                            title={copy.sectionIdleTitle}
                            description={copy.sectionIdleDescription}
                        >
                            <ul className="ui-info-topic-list">
                                <li>
                                    <p className="ui-info-topic-lead">
                                        <span className="ui-info-topic-label">
                                            {idleEditorHasAction
                                                ? copy.sectionIdleSelectLead
                                                : copy.sectionIdleEmptyLead}
                                        </span>
                                    </p>
                                    <p className="ui-field-hint ui-info-topic-hint">
                                        {idleEditorHasAction
                                            ? copy.sectionIdleSelectHint
                                            : copy.sectionIdleEmptyHint}
                                    </p>
                                </li>
                            </ul>
                        </ConfigurationInfoSection>
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
                onSave: () => void handleSave(),
                saveDisabled: directoryEditorSaveDisabled({
                    hasEditableContext: Boolean(selectedMemberKey),
                    canSubmit,
                    isSaving,
                    isDirty
                }),
                saveLabel: copy.save,
                savingLabel: copy.saving,
                isSaving,
                dangerAction:
                    !isCreateMode && selectedMember ? (
                        <button
                            type="button"
                            className="ui-button-danger"
                            onClick={handleToggleDelete}
                            disabled={isSaving}
                        >
                            {isDeletePending ? copy.undoDelete : copy.delete}
                        </button>
                    ) : null
            }}
        />
    );
}
