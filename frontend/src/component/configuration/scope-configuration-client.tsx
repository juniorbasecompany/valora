"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState
} from "react";
import { createPortal } from "react-dom";

import { PageHeader } from "@/component/app-shell/page-header";
import { ConfigurationEditorFooter } from "@/component/configuration/configuration-editor-footer";
import { ConfigurationHistoryPlaceholder } from "@/component/configuration/configuration-history-placeholder";
import { ConfigurationInfoSection } from "@/component/configuration/configuration-info-section";
import { ConfigurationNameDisplayNameFields } from "@/component/configuration/configuration-name-display-name-fields";
import { DirectoryCreateToolbarButton } from "@/component/configuration/directory-create-toolbar-button";
import { useEditorPanelFlash } from "@/component/configuration/use-editor-panel-flash";
import { useReplaceConfigurationPath } from "@/component/configuration/use-replace-configuration-path";
import type {
    TenantScopeDirectoryResponse,
    TenantScopeRecord
} from "@/lib/auth/types";
import { parseErrorDetail } from "@/lib/api/parse-error-detail";

export type ScopeConfigurationCopy = {
    title: string;
    description: string;
    empty: string;
    historyTitle: string;
    historyDescription: string;
    nameLabel: string;
    nameHint: string;
    displayNameLabel: string;
    displayNameHint: string;
    sectionInfoTitle: string;
    sectionInfoDescription: string;
    infoIdLabel: string;
    infoNameRegisteredLabel: string;
    infoDisplayRegisteredLabel: string;
    infoCanEditLabel: string;
    infoCanDeleteLabel: string;
    infoYes: string;
    infoNo: string;
    infoCreateLead: string;
    infoCreateHint: string;
    cancel: string;
    newScope: string;
    delete: string;
    undoDelete: string;
    save: string;
    saving: string;
    readOnlyNotice: string;
    saveError: string;
    createError: string;
    deleteError: string;
    validationError: string;
    discardConfirm: string;
    selectPrompt: string;
};

type ScopeConfigurationClientProps = {
    locale: string;
    initialDirectory: TenantScopeDirectoryResponse;
    copy: ScopeConfigurationCopy;
};

type ScopeSelectionKey = number | "new" | null;

function resolveScopeLabel(scope: TenantScopeRecord) {
    return scope.name.trim() || scope.display_name.trim() || `#${scope.id}`;
}

function parseSelectedScopeKey(raw: string | null): ScopeSelectionKey {
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

function resolveSelectedScopeKey(
    itemList: TenantScopeRecord[],
    preferredKey: ScopeSelectionKey,
    canCreate: boolean
): ScopeSelectionKey {
    if (preferredKey === "new") {
        return canCreate ? "new" : (itemList[0]?.id ?? null);
    }

    if (typeof preferredKey === "number") {
        return itemList.find((item) => item.id === preferredKey)?.id ?? (itemList[0]?.id ?? null);
    }

    return itemList[0]?.id ?? (canCreate ? "new" : null);
}

export function ScopeConfigurationClient({
    locale,
    initialDirectory,
    copy
}: ScopeConfigurationClientProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const initialSearchScopeKey =
        parseSelectedScopeKey(searchParams.get("scope")) ??
        initialDirectory.current_scope_id ??
        null;
    const initialSelectedScopeKey = resolveSelectedScopeKey(
        initialDirectory.item_list,
        initialSearchScopeKey,
        initialDirectory.can_create
    );
    const initialSelectedScope =
        typeof initialSelectedScopeKey === "number"
            ? initialDirectory.item_list.find((item) => item.id === initialSelectedScopeKey) ?? null
            : null;

    const configurationPath = `/${locale}/app/configuration`;
    const scopePath = `/${locale}/app/configuration/scope`;

    const replacePath = useCallback(
        (nextPath: string) => {
            router.replace(nextPath, { scroll: false });
        },
        [router]
    );

    const [directory, setDirectory] = useState(initialDirectory);
    const [selectedScopeId, setSelectedScopeId] = useState<number | null>(
        typeof initialSelectedScopeKey === "number" ? initialSelectedScopeKey : null
    );
    const [isCreateMode, setIsCreateMode] = useState(initialSelectedScopeKey === "new");
    const [name, setName] = useState(initialSelectedScope?.name ?? "");
    const [displayName, setDisplayName] = useState(
        initialSelectedScope?.display_name ?? ""
    );
    const [baseline, setBaseline] = useState({
        name: initialSelectedScope?.name ?? "",
        displayName: initialSelectedScope?.display_name ?? ""
    });
    const [fieldError, setFieldError] = useState<{
        name?: string;
        displayName?: string;
    }>({});
    const [requestErrorMessage, setRequestErrorMessage] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isDeletePending, setIsDeletePending] = useState(false);
    const editorPanelElementRef = useRef<HTMLDivElement | null>(null);
    const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
    const initialSearchScopeKeyRef = useRef<ScopeSelectionKey>(initialSearchScopeKey);
    const selectedScopeKeyRef = useRef<ScopeSelectionKey>(initialSelectedScopeKey);
    const didResolveInitialUrlRef = useRef(false);

    const selectedScope = useMemo(() => {
        if (isCreateMode) {
            return null;
        }

        return (
            directory.item_list.find((item) => item.id === selectedScopeId) ??
            directory.item_list[0] ??
            null
        );
    }, [directory.item_list, isCreateMode, selectedScopeId]);

    const selectedScopeKey: ScopeSelectionKey = isCreateMode ? "new" : selectedScope?.id ?? null;

    useReplaceConfigurationPath(
        scopePath,
        searchParams,
        replacePath,
        "scope",
        isCreateMode ? "new" : selectedScope?.id ?? null
    );

    const editorFlashKey = useMemo(() => {
        if (isCreateMode) {
            return "new";
        }

        if (!selectedScope) {
            return null;
        }

        return `id:${String(selectedScope.id)}:name:${selectedScope.name}:display:${selectedScope.display_name}`;
    }, [isCreateMode, selectedScope]);

    const isEditorFlashActive = useEditorPanelFlash(editorPanelElementRef, editorFlashKey);

    useEffect(() => {
        setPortalTarget(document.getElementById("app-shell-footer-slot"));
    }, []);

    useEffect(() => {
        selectedScopeKeyRef.current = isCreateMode ? "new" : selectedScope?.id ?? null;
    }, [isCreateMode, selectedScope]);

    const syncFromDirectory = useCallback(
        (nextDirectory: TenantScopeDirectoryResponse, preferredKey?: ScopeSelectionKey) => {
            const nextKey = resolveSelectedScopeKey(
                nextDirectory.item_list,
                preferredKey ?? null,
                nextDirectory.can_create
            );
            const nextSelectedScope =
                typeof nextKey === "number"
                    ? nextDirectory.item_list.find((item) => item.id === nextKey) ?? null
                    : null;

            setDirectory(nextDirectory);
            setIsCreateMode(nextKey === "new");
            setSelectedScopeId(typeof nextKey === "number" ? nextKey : null);
            setName(nextSelectedScope?.name ?? "");
            setDisplayName(nextSelectedScope?.display_name ?? "");
            setBaseline({
                name: nextSelectedScope?.name ?? "",
                displayName: nextSelectedScope?.display_name ?? ""
            });
            setFieldError({});
            setRequestErrorMessage(null);
            setIsDeletePending(false);

            return nextKey;
        },
        []
    );

    useEffect(() => {
        const preferredKey = didResolveInitialUrlRef.current
            ? selectedScopeKeyRef.current
            : initialSearchScopeKeyRef.current;

        didResolveInitialUrlRef.current = true;
        syncFromDirectory(initialDirectory, preferredKey);
    }, [initialDirectory, syncFromDirectory]);

    const isDirty = useMemo(() => {
        return (
            name.trim() !== baseline.name.trim() ||
            displayName.trim() !== baseline.displayName.trim() ||
            isDeletePending
        );
    }, [baseline.displayName, baseline.name, displayName, isDeletePending, name]);

    const validate = useCallback(() => {
        const nextError: { name?: string; displayName?: string } = {};

        if (!name.trim()) {
            nextError.name = copy.validationError;
        }

        if (!displayName.trim()) {
            nextError.displayName = copy.validationError;
        }

        setFieldError(nextError);
        return Object.keys(nextError).length === 0;
    }, [copy.validationError, displayName, name]);

    const handleStartCreate = useCallback(() => {
        if (!directory.can_create || isSaving) {
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

    const handleSelectScope = useCallback(
        (scope: TenantScopeRecord) => {
            if (!isCreateMode && scope.id === selectedScope?.id) {
                return;
            }

            if (isDirty && !window.confirm(copy.discardConfirm)) {
                return;
            }

            syncFromDirectory(directory, scope.id);
        },
        [copy.discardConfirm, directory, isCreateMode, isDirty, selectedScope, syncFromDirectory]
    );

    const handleToggleDelete = useCallback(() => {
        if (!selectedScope?.can_delete || isSaving) {
            return;
        }

        setRequestErrorMessage(null);
        setIsDeletePending((previous) => !previous);
    }, [isSaving, selectedScope]);

    const handleSave = useCallback(async () => {
        setRequestErrorMessage(null);

        if (!isDeletePending && !validate()) {
            return;
        }

        setIsSaving(true);
        try {
            if (isCreateMode) {
                const previousScopeIdSet = new Set(directory.item_list.map((item) => item.id));
                const response = await fetch("/api/auth/tenant/current/scopes", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
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

                const updatedDirectory = data as TenantScopeDirectoryResponse;
                const createdScopeId =
                    updatedDirectory.item_list.find((item) => !previousScopeIdSet.has(item.id))?.id ??
                    updatedDirectory.item_list.find(
                        (item) =>
                            item.name === name.trim() && item.display_name === displayName.trim()
                    )?.id ??
                    updatedDirectory.item_list[0]?.id ??
                    null;

                syncFromDirectory(updatedDirectory, createdScopeId);
                return;
            }

            if (!selectedScope) {
                return;
            }

            const response = await fetch(
                `/api/auth/tenant/current/scopes/${selectedScope.id}`,
                isDeletePending
                    ? {
                        method: "DELETE"
                    }
                    : {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            name: name.trim(),
                            display_name: displayName.trim()
                        })
                    }
            );
            const data: unknown = await response.json().catch(() => ({}));

            if (!response.ok) {
                const fallback = isDeletePending ? copy.deleteError : copy.saveError;
                setRequestErrorMessage(parseErrorDetail(data, fallback) ?? fallback);
                return;
            }

            const updatedDirectory = data as TenantScopeDirectoryResponse;
            const nextSelection =
                isDeletePending && updatedDirectory.item_list.length === 0
                    ? updatedDirectory.can_create
                        ? "new"
                        : null
                    : selectedScope.id;
            syncFromDirectory(updatedDirectory, nextSelection);
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
        directory.item_list,
        displayName,
        isCreateMode,
        isDeletePending,
        name,
        selectedScope,
        syncFromDirectory,
        validate
    ]);

    const canEditForm = isCreateMode
        ? directory.can_create
        : selectedScope?.can_edit ?? false;
    const canSubmit = isCreateMode
        ? directory.can_create
        : isDeletePending
            ? selectedScope?.can_delete ?? false
            : selectedScope?.can_edit ?? false;
    const footerErrorMessage =
        requestErrorMessage ?? fieldError.name ?? fieldError.displayName ?? null;

    return (
        <section className="ui-page-stack ui-page-stack-footer">
            <PageHeader title={copy.title} description={copy.description} />

            <div className="ui-layout-directory ui-layout-directory-editor">
                <aside className="ui-panel ui-stack-lg ui-panel-context-card">
                    {!directory.can_edit ? (
                        <div className="ui-notice-attention ui-notice-block">
                            {copy.readOnlyNotice}
                        </div>
                    ) : null}

                    <div className="ui-directory-list">
                        {directory.can_create ? (
                            <DirectoryCreateToolbarButton
                                label={copy.newScope}
                                active={isCreateMode}
                                disabled={isSaving}
                                onClick={handleStartCreate}
                            />
                        ) : null}

                        {directory.item_list.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => handleSelectScope(item)}
                                className="ui-directory-item"
                                data-selected={item.id === selectedScope?.id ? "true" : undefined}
                                data-delete-pending={
                                    item.id === selectedScope?.id && isDeletePending ? "true" : undefined
                                }
                            >
                                <p className="ui-directory-title">
                                    {resolveScopeLabel(item)}
                                </p>
                                <p className="ui-directory-caption-wrap">
                                    {item.display_name}
                                </p>
                                <div className="ui-directory-meta">
                                    <span className="ui-badge ui-badge-neutral">
                                        #{item.id}
                                    </span>
                                </div>
                            </button>
                        ))}

                        {directory.item_list.length === 0 && !directory.can_create ? (
                            <div className="ui-panel ui-empty-panel ui-panel-body-compact">
                                {copy.empty}
                            </div>
                        ) : null}
                    </div>
                </aside>

                <div
                    ref={editorPanelElementRef}
                    className="ui-panel ui-panel-editor ui-editor-panel"
                    data-delete-pending={isDeletePending ? "true" : undefined}
                >
                    <div className="ui-editor-panel-body">
                        {selectedScopeKey ? (
                            <div className="ui-editor-card-flow">
                                <ConfigurationNameDisplayNameFields
                                    nameInputId="scope-name"
                                    displayTextareaId="scope-display-name"
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
                                    flashActive={isEditorFlashActive}
                                />

                                {!isCreateMode && selectedScope ? (
                                    <ConfigurationInfoSection
                                        title={copy.sectionInfoTitle}
                                        description={copy.sectionInfoDescription}
                                    >
                                        <ul className="ui-info-topic-list">
                                            <li>
                                                <p className="ui-info-topic-lead">
                                                    <span className="ui-info-topic-label">
                                                        {copy.infoIdLabel}
                                                    </span>
                                                    {": "}
                                                    <span className="ui-info-topic-value">
                                                        {selectedScope.id}
                                                    </span>
                                                </p>
                                            </li>
                                            <li>
                                                <p className="ui-info-topic-lead">
                                                    <span className="ui-info-topic-label">
                                                        {copy.infoNameRegisteredLabel}
                                                    </span>
                                                    {": "}
                                                    <span className="ui-info-topic-value">
                                                        {selectedScope.name.trim() || "—"}
                                                    </span>
                                                </p>
                                            </li>
                                            <li>
                                                <p className="ui-info-topic-lead">
                                                    <span className="ui-info-topic-label">
                                                        {copy.infoDisplayRegisteredLabel}
                                                    </span>
                                                    {": "}
                                                    <span className="ui-info-topic-value">
                                                        {selectedScope.display_name.trim() || "—"}
                                                    </span>
                                                </p>
                                            </li>
                                            <li>
                                                <p className="ui-info-topic-lead">
                                                    <span className="ui-info-topic-label">
                                                        {copy.infoCanEditLabel}
                                                    </span>
                                                    {": "}
                                                    <span className="ui-info-topic-value">
                                                        {selectedScope.can_edit ? copy.infoYes : copy.infoNo}
                                                    </span>
                                                </p>
                                            </li>
                                            <li>
                                                <p className="ui-info-topic-lead">
                                                    <span className="ui-info-topic-label">
                                                        {copy.infoCanDeleteLabel}
                                                    </span>
                                                    {": "}
                                                    <span className="ui-info-topic-value">
                                                        {selectedScope.can_delete ? copy.infoYes : copy.infoNo}
                                                    </span>
                                                </p>
                                            </li>
                                        </ul>
                                    </ConfigurationInfoSection>
                                ) : null}

                                {isCreateMode ? (
                                    <ConfigurationInfoSection
                                        title={copy.sectionInfoTitle}
                                        description={copy.sectionInfoDescription}
                                    >
                                        <ul className="ui-info-topic-list">
                                            <li>
                                                <p className="ui-info-topic-lead">
                                                    <span className="ui-info-topic-label">
                                                        {copy.infoCreateLead}
                                                    </span>
                                                </p>
                                                <p className="ui-field-hint ui-info-topic-hint">
                                                    {copy.infoCreateHint}
                                                </p>
                                            </li>
                                        </ul>
                                    </ConfigurationInfoSection>
                                ) : null}
                            </div>
                        ) : (
                            <div className="ui-panel ui-empty-panel">
                                {copy.selectPrompt}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <ConfigurationHistoryPlaceholder
                headingId="scope-history-heading"
                title={copy.historyTitle}
                description={copy.historyDescription}
            />

            {portalTarget
                ? createPortal(
                    <ConfigurationEditorFooter
                        configurationPath={configurationPath}
                        cancelLabel={copy.cancel}
                        discardConfirm={copy.discardConfirm}
                        isDirty={isDirty}
                        footerErrorMessage={footerErrorMessage}
                        onSave={() => void handleSave()}
                        saveDisabled={
                            !selectedScopeKey || !canSubmit || isSaving || !isDirty
                        }
                        saveLabel={copy.save}
                        savingLabel={copy.saving}
                        isSaving={isSaving}
                        dangerAction={
                            !isCreateMode && selectedScope ? (
                                <button
                                    type="button"
                                    className="ui-button-danger"
                                    onClick={handleToggleDelete}
                                    disabled={!selectedScope.can_delete || isSaving}
                                >
                                    {isDeletePending ? copy.undoDelete : copy.delete}
                                </button>
                            ) : null
                        }
                    />,
                    portalTarget
                )
                : null}
        </section>
    );
}
