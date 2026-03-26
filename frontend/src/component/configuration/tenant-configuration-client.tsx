"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
    directoryEditorCanSubmitForDirectoryEditor,
    directoryEditorSaveDisabled
} from "@/component/configuration/configuration-directory-editor-policy";
import { ConfigurationDirectoryEditorShell } from "@/component/configuration/configuration-directory-editor-shell";
import { ConfigurationInfoSection } from "@/component/configuration/configuration-info-section";
import { ConfigurationNameDisplayNameFields } from "@/component/configuration/configuration-name-display-name-fields";
import { useEditorPanelFlash } from "@/component/configuration/use-editor-panel-flash";
import type { TenantCurrentResponse } from "@/lib/auth/types";
import { parseErrorDetail } from "@/lib/api/parse-error-detail";

export type TenantConfigurationCopy = {
    title: string;
    description: string;
    /** Painel vazio até o utilizador abrir o registo na lista (padrão dos diretórios). */
    emptyEditor: string;
    historyTitle: string;
    historyDescription: string;
    legalNameLabel: string;
    legalNameHint: string;
    displayNameLabel: string;
    displayNameHint: string;
    metadataSectionTitle: string;
    metadataSectionDescription: string;
    metadataIdLabel: string;
    cancel: string;
    delete: string;
    undoDelete: string;
    save: string;
    saving: string;
    readOnlyNotice: string;
    saveError: string;
    deleteError: string;
    validationError: string;
    discardConfirm: string;
};

type TenantConfigurationClientProps = {
    locale: string;
    initialTenant: TenantCurrentResponse;
    copy: TenantConfigurationCopy;
};

function resolveAsideTitle(displayName: string, legalName: string, tenantId: number) {
    const display = displayName.trim();
    if (display) {
        return display;
    }
    const legal = legalName.trim();
    if (legal) {
        return legal;
    }
    return `#${tenantId}`;
}

export function TenantConfigurationClient({
    locale,
    initialTenant,
    copy
}: TenantConfigurationClientProps) {
    const router = useRouter();
    const configurationPath = `/${locale}/app/configuration`;
    const editorPanelElementRef = useRef<HTMLDivElement | null>(null);

    const [tenant, setTenant] = useState(initialTenant);
    const [editorEngaged, setEditorEngaged] = useState(false);
    const [displayName, setDisplayName] = useState("");
    const [legalName, setLegalName] = useState("");
    const [baseline, setBaseline] = useState({
        displayName: "",
        legalName: ""
    });
    const [fieldError, setFieldError] = useState<{
        displayName?: string;
        name?: string;
    }>({});
    const [requestErrorMessage, setRequestErrorMessage] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isDeletePending, setIsDeletePending] = useState(false);
    const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

    useEffect(() => {
        setTenant(initialTenant);
        setFieldError({});
        setRequestErrorMessage(null);
        setIsDeletePending(false);
        if (editorEngaged) {
            setDisplayName(initialTenant.display_name);
            setLegalName(initialTenant.name);
            setBaseline({
                displayName: initialTenant.display_name,
                legalName: initialTenant.name
            });
        }
    }, [editorEngaged, initialTenant]);

    const editorFlashKey = useMemo(() => {
        if (!editorEngaged) {
            return null;
        }
        return `id:${String(tenant.id)}:legal:${tenant.name}:display:${tenant.display_name}`;
    }, [editorEngaged, tenant.display_name, tenant.id, tenant.name]);
    const isEditorFlashActive = useEditorPanelFlash(editorPanelElementRef, editorFlashKey);

    const isDirty = useMemo(() => {
        return (
            displayName.trim() !== baseline.displayName.trim() ||
            legalName.trim() !== baseline.legalName.trim() ||
            isDeletePending
        );
    }, [baseline.displayName, baseline.legalName, displayName, isDeletePending, legalName]);

    const validate = useCallback(() => {
        const nextError: { displayName?: string; name?: string } = {};
        if (!displayName.trim()) {
            nextError.displayName = copy.validationError;
        }
        if (!legalName.trim()) {
            nextError.name = copy.validationError;
        }
        setFieldError(nextError);
        return Object.keys(nextError).length === 0;
    }, [copy.validationError, displayName, legalName]);

    const handleToggleDelete = useCallback(() => {
        if (!tenant.can_delete || isSaving) {
            return;
        }
        setRequestErrorMessage(null);
        setIsDeletePending((previous) => !previous);
    }, [isSaving, tenant.can_delete]);

    const handleDirectoryRowClick = useCallback(() => {
        if (editorEngaged) {
            if (isDirty && !window.confirm(copy.discardConfirm)) {
                return;
            }
            setEditorEngaged(false);
            setDisplayName("");
            setLegalName("");
            setBaseline({ displayName: "", legalName: "" });
            setFieldError({});
            setRequestErrorMessage(null);
            setIsDeletePending(false);
            return;
        }

        setEditorEngaged(true);
        setDisplayName(tenant.display_name);
        setLegalName(tenant.name);
        setBaseline({
            displayName: tenant.display_name,
            legalName: tenant.name
        });
        setFieldError({});
        setRequestErrorMessage(null);
        setIsDeletePending(false);
    }, [copy.discardConfirm, editorEngaged, isDirty, tenant.display_name, tenant.name]);

    const handleSave = useCallback(async () => {
        if (!editorEngaged) {
            return;
        }
        setRequestErrorMessage(null);
        if (!isDeletePending && !validate()) {
            return;
        }
        setIsSaving(true);
        try {
            const response = await fetch(
                "/api/auth/tenant/current",
                isDeletePending
                    ? {
                          method: "DELETE"
                      }
                    : {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                              display_name: displayName.trim(),
                              name: legalName.trim()
                          })
                      }
            );
            const data: unknown = await response.json().catch(() => ({}));
            if (!response.ok) {
                setRequestErrorMessage(
                    parseErrorDetail(
                        data,
                        isDeletePending ? copy.deleteError : copy.saveError
                    ) ?? (isDeletePending ? copy.deleteError : copy.saveError)
                );
                return;
            }
            if (isDeletePending) {
                await fetch("/api/auth/logout", {
                    method: "POST"
                }).catch(() => null);
                router.replace(`/${locale}/login?reason=signed_out`);
                return;
            }
            const updated = data as TenantCurrentResponse;
            setTenant(updated);
            setDisplayName(updated.display_name);
            setLegalName(updated.name);
            setBaseline({
                displayName: updated.display_name,
                legalName: updated.name
            });
            setIsDeletePending(false);
            setHistoryRefreshKey((previous) => previous + 1);
            router.refresh();
        } catch {
            setRequestErrorMessage(isDeletePending ? copy.deleteError : copy.saveError);
        } finally {
            setIsSaving(false);
        }
    }, [
        copy.deleteError,
        copy.saveError,
        displayName,
        editorEngaged,
        isDeletePending,
        legalName,
        locale,
        router,
        validate
    ]);

    const canSubmit = directoryEditorCanSubmitForDirectoryEditor({
        isCreateMode: false,
        isDeletePending,
        canCreate: false,
        canEdit: editorEngaged && tenant.can_edit
    });

    const footerErrorMessage =
        requestErrorMessage ?? fieldError.name ?? fieldError.displayName ?? null;

    const asideTitle = resolveAsideTitle(tenant.display_name, tenant.name, tenant.id);
    const asideCaption = tenant.name.trim() || `#${tenant.id}`;

    return (
        <ConfigurationDirectoryEditorShell
            headerTitle={copy.title}
            headerDescription={copy.description}
            editorPanelRef={editorPanelElementRef}
            isDeletePending={isDeletePending}
            editorVariant="emptyWhenNoContext"
            hasEditorContext={editorEngaged}
            emptyEditorMessage={copy.emptyEditor}
            directoryAside={
                <>
                    {!tenant.can_edit ? (
                        <div className="ui-notice-attention ui-notice-block">
                            {copy.readOnlyNotice}
                        </div>
                    ) : null}

                    <div className="ui-directory-list">
                        <button
                            type="button"
                            className="ui-directory-item"
                            data-selected={editorEngaged ? "true" : undefined}
                            data-delete-pending={isDeletePending ? "true" : undefined}
                            onClick={handleDirectoryRowClick}
                        >
                            <div className="ui-row-between">
                                <div className="ui-min-w-0">
                                    <p className="ui-directory-title">{asideTitle}</p>
                                    <p className="ui-directory-caption">{asideCaption}</p>
                                </div>
                            </div>
                        </button>
                    </div>
                </>
            }
            editorForm={
                <>
                    <ConfigurationNameDisplayNameFields
                        nameInputId="tenant-legal-name"
                        displayTextareaId="tenant-display-name"
                        name={legalName}
                        displayName={displayName}
                        setName={setLegalName}
                        setDisplayName={setDisplayName}
                        setFieldError={setFieldError}
                        fieldError={fieldError}
                        disabled={isDeletePending || !tenant.can_edit}
                        nameLabel={copy.legalNameLabel}
                        nameHint={copy.legalNameHint}
                        displayNameLabel={copy.displayNameLabel}
                        displayNameHint={copy.displayNameHint}
                        flashActive={isEditorFlashActive}
                        onAfterFieldEdit={() => setRequestErrorMessage(null)}
                    />

                    <ConfigurationInfoSection
                        title={copy.metadataSectionTitle}
                        description={copy.metadataSectionDescription}
                    >
                        <ul className="ui-info-topic-list">
                            <li>
                                <p className="ui-info-topic-lead">
                                    <span className="ui-info-topic-label">{copy.metadataIdLabel}</span>
                                    {": "}
                                    <span className="ui-info-topic-value">{tenant.id}</span>
                                </p>
                            </li>
                        </ul>
                    </ConfigurationInfoSection>
                </>
            }
            history={{
                headingId: "tenant-history-heading",
                title: copy.historyTitle,
                description: copy.historyDescription,
                tableName: "tenant",
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
                    hasEditableContext: editorEngaged,
                    canSubmit,
                    isSaving,
                    isDirty
                }),
                saveLabel: copy.save,
                savingLabel: copy.saving,
                isSaving,
                dangerAction:
                    editorEngaged && tenant.can_delete ? (
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
