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
import { useEditorPanelFlash } from "@/component/configuration/use-editor-panel-flash";
import { useReplaceConfigurationPath } from "@/component/configuration/use-replace-configuration-path";
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
    cancel: string;
    delete: string;
    undoDelete: string;
    save: string;
    saving: string;
    readOnlyNotice: string;
    protectedRecordNotice: string;
    saveError: string;
    deleteError: string;
    validationError: string;
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

function getStatusToneClass(status: MemberStatusKey) {
    if (status === "ACTIVE") {
        return "ui-tone-positive";
    }

    if (status === "PENDING") {
        return "ui-tone-attention";
    }

    return "ui-tone-danger";
}

function parseSelectedMemberId(raw: string | null): number | null {
    if (!raw) {
        return null;
    }

    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 1) {
        return null;
    }

    return parsed;
}

function resolveSelectedMemberId(
    itemList: TenantMemberRecord[],
    preferredMemberId: number | null
): number | null {
    return (
        itemList.find((item) => item.id === preferredMemberId)?.id ??
        itemList[0]?.id ??
        null
    );
}

export function MemberConfigurationClient({
    locale,
    initialDirectory,
    copy
}: MemberConfigurationClientProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const initialSearchMemberId = parseSelectedMemberId(searchParams.get("member"));
    const initialSelectedMemberId = resolveSelectedMemberId(
        initialDirectory.item_list,
        initialSearchMemberId
    );
    const initialSelectedMember =
        initialDirectory.item_list.find((item) => item.id === initialSelectedMemberId) ?? null;

    const configurationPath = `/${locale}/app/configuration`;
    const memberPath = `/${locale}/app/configuration/member`;

    const replacePath = useCallback(
        (nextPath: string) => {
            router.replace(nextPath, { scroll: false });
        },
        [router]
    );

    const [directory, setDirectory] = useState(initialDirectory);
    const [selectedMemberId, setSelectedMemberId] = useState<number | null>(
        initialSelectedMemberId
    );
    const [displayName, setDisplayName] = useState(
        initialSelectedMember?.display_name ?? ""
    );
    const [name, setName] = useState(initialSelectedMember?.name ?? "");
    const [baseline, setBaseline] = useState({
        displayName: initialSelectedMember?.display_name ?? "",
        name: initialSelectedMember?.name ?? ""
    });
    const [fieldError, setFieldError] = useState<{
        displayName?: string;
        name?: string;
    }>({});
    const [requestErrorMessage, setRequestErrorMessage] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isDeletePending, setIsDeletePending] = useState(false);
    const editorPanelElementRef = useRef<HTMLDivElement | null>(null);
    const initialSearchMemberIdRef = useRef<number | null>(initialSearchMemberId);
    const selectedMemberIdRef = useRef<number | null>(initialSelectedMemberId);
    const didResolveInitialUrlRef = useRef(false);

    useReplaceConfigurationPath(
        memberPath,
        searchParams,
        replacePath,
        "member",
        selectedMemberId
    );

    useEffect(() => {
        selectedMemberIdRef.current = selectedMemberId;
    }, [selectedMemberId]);

    const selectedMember = useMemo(() => {
        return (
            directory.item_list.find((item) => item.id === selectedMemberId) ??
            directory.item_list[0] ??
            null
        );
    }, [directory.item_list, selectedMemberId]);

    const editorFlashKey = useMemo(() => {
        if (!selectedMember) {
            return null;
        }

        return `id:${String(selectedMember.id)}:name:${selectedMember.name}:display:${selectedMember.display_name}`;
    }, [selectedMember]);

    const isEditorFlashActive = useEditorPanelFlash(editorPanelElementRef, editorFlashKey);

    const syncFromDirectory = useCallback(
        (
            nextDirectory: TenantMemberDirectoryResponse,
            preferredMemberId?: number | null
        ) => {
            const nextSelectedMemberId = resolveSelectedMemberId(
                nextDirectory.item_list,
                preferredMemberId ?? null
            );
            const nextSelectedMember =
                nextDirectory.item_list.find((item) => item.id === nextSelectedMemberId) ?? null;

            setDirectory(nextDirectory);
            setSelectedMemberId(nextSelectedMemberId);
            setDisplayName(nextSelectedMember?.display_name ?? "");
            setName(nextSelectedMember?.name ?? "");
            setBaseline({
                displayName: nextSelectedMember?.display_name ?? "",
                name: nextSelectedMember?.name ?? ""
            });
            setFieldError({});
            setRequestErrorMessage(null);
            setIsDeletePending(false);

            return nextSelectedMemberId;
        },
        []
    );

    useEffect(() => {
        const preferredMemberId = didResolveInitialUrlRef.current
            ? selectedMemberIdRef.current
            : initialSearchMemberIdRef.current;

        didResolveInitialUrlRef.current = true;
        syncFromDirectory(initialDirectory, preferredMemberId);
    }, [initialDirectory, syncFromDirectory]);

    const isDirty = useMemo(() => {
        return (
            displayName.trim() !== baseline.displayName.trim() ||
            name.trim() !== baseline.name.trim() ||
            isDeletePending
        );
    }, [baseline.displayName, baseline.name, displayName, isDeletePending, name]);

    const validate = useCallback(() => {
        const nextError: { displayName?: string; name?: string } = {};

        if (!displayName.trim()) {
            nextError.displayName = copy.validationError;
        }

        if (!name.trim()) {
            nextError.name = copy.validationError;
        }

        setFieldError(nextError);
        return Object.keys(nextError).length === 0;
    }, [copy.validationError, displayName, name]);

    const handleSelectMember = useCallback(
        (member: TenantMemberRecord) => {
            if (member.id === selectedMemberId) {
                return;
            }

            if (isDirty && !window.confirm(copy.discardConfirm)) {
                return;
            }

            syncFromDirectory(directory, member.id);
        },
        [copy.discardConfirm, directory, isDirty, selectedMemberId, syncFromDirectory]
    );

    const handleToggleDelete = useCallback(() => {
        if (isSaving) {
            return;
        }

        setRequestErrorMessage(null);
        setIsDeletePending((previous) => !previous);
    }, [isSaving]);

    const handleSave = useCallback(async () => {
        if (!selectedMember) {
            return;
        }

        setRequestErrorMessage(null);

        if (!isDeletePending && !validate()) {
            return;
        }

        setIsSaving(true);
        try {
            const response = await fetch(
                `/api/auth/tenant/current/members/${selectedMember.id}`,
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
        } catch {
            setRequestErrorMessage(isDeletePending ? copy.deleteError : copy.saveError);
        } finally {
            setIsSaving(false);
        }
    }, [
        copy.deleteError,
        copy.saveError,
        displayName,
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

    const canSubmit = directoryEditorCanSubmitForDirectoryEditor({
        isCreateMode: false,
        isDeletePending,
        canCreate: false,
        canEdit: selectedMember?.can_edit ?? false
    });

    const footerErrorMessage =
        requestErrorMessage ?? fieldError.name ?? fieldError.displayName ?? null;

    const hasDirectoryContext = directory.item_list.length > 0;

    return (
        <ConfigurationDirectoryEditorShell
            headerTitle={copy.title}
            headerDescription={copy.description}
            editorPanelRef={editorPanelElementRef}
            isDeletePending={isDeletePending}
            editorVariant="emptyWhenNoContext"
            hasEditorContext={hasDirectoryContext}
            emptyEditorMessage={copy.empty}
            directoryAside={
                <>
                    {!directory.can_edit ? (
                        <div className="ui-notice-attention ui-notice-block">
                            {copy.readOnlyNotice}
                        </div>
                    ) : null}

                    <div className="ui-directory-list">
                        {directory.item_list.map((item) => {
                            const itemStatusKey = normalizeStatusKey(item.status);
                            const roleLabel =
                                copy.roleLabels[item.role_name as keyof typeof copy.roleLabels] ??
                                item.role_name;

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
                                    <div className="ui-row-between">
                                        <div className="ui-min-w-0">
                                            <p className="ui-directory-title">
                                                {resolveMemberLabel(item)}
                                            </p>
                                            <p className="ui-directory-caption">
                                                {item.email}
                                            </p>
                                        </div>
                                        <span
                                            className={`ui-badge ui-badge-neutral ${getStatusToneClass(itemStatusKey)}`}
                                        >
                                            {copy.statusLabels[itemStatusKey]}
                                        </span>
                                    </div>

                                    <div className="ui-directory-meta">
                                        <span className="ui-badge ui-badge-neutral">
                                            {roleLabel}
                                        </span>
                                    </div>
                                </button>
                            );
                        })}

                        {directory.item_list.length === 0 ? (
                            <div className="ui-panel ui-empty-panel ui-panel-body-compact">
                                {copy.empty}
                            </div>
                        ) : null}
                    </div>
                </>
            }
            editorForm={
                <>
                    {directory.can_edit && selectedMember && !selectedMember.can_edit ? (
                        <div className="ui-notice-attention ui-notice-block">
                            {copy.protectedRecordNotice}
                        </div>
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
                        disabled={isDeletePending || !selectedMember?.can_edit}
                        nameLabel={copy.nameLabel}
                        nameHint={copy.nameHint}
                        displayNameLabel={copy.displayNameLabel}
                        displayNameHint={copy.displayNameHint}
                        flashActive={isEditorFlashActive}
                        onAfterFieldEdit={() => setRequestErrorMessage(null)}
                    />

                    {selectedMember ? (
                        <ConfigurationInfoSection
                            title={copy.sectionAccessTitle}
                            description={copy.sectionAccessDescription}
                        >
                            <ul className="ui-info-topic-list">
                                <li>
                                    <p className="ui-info-topic-lead">
                                        <span className="ui-info-topic-label">{copy.emailLabel}</span>
                                        {": "}
                                        <span className="ui-info-topic-value">
                                            {selectedMember.email}
                                        </span>
                                    </p>
                                    <p className="ui-field-hint ui-info-topic-hint">{copy.emailHint}</p>
                                </li>
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
                                        <span className="ui-info-topic-label">{copy.roleLabel}</span>
                                        {": "}
                                        <span className="ui-info-topic-value">{accessRoleText}</span>
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
                    ) : null}
                </>
            }
            history={{
                headingId: "member-history-heading",
                title: copy.historyTitle,
                description: copy.historyDescription
            }}
            footer={{
                configurationPath,
                cancelLabel: copy.cancel,
                discardConfirm: copy.discardConfirm,
                isDirty,
                footerErrorMessage,
                onSave: () => void handleSave(),
                saveDisabled: directoryEditorSaveDisabled({
                    hasEditableContext: hasDirectoryContext,
                    canSubmit,
                    isSaving,
                    isDirty
                }),
                saveLabel: copy.save,
                savingLabel: copy.saving,
                isSaving,
                dangerAction: selectedMember ? (
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
