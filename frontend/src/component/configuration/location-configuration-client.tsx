"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";

import {
    directoryEditorCanSubmitForDirectoryEditor,
    directoryEditorSaveDisabled
} from "@/component/configuration/configuration-directory-editor-policy";
import { ConfigurationDirectoryEditorShell } from "@/component/configuration/configuration-directory-editor-shell";
import { ConfigurationInfoSection } from "@/component/configuration/configuration-info-section";
import { ConfigurationNameDisplayNameFields } from "@/component/configuration/configuration-name-display-name-fields";
import { DirectoryCreateToolbarButton } from "@/component/configuration/directory-create-toolbar-button";
import { useEditorPanelFlash } from "@/component/configuration/use-editor-panel-flash";
import { useReplaceConfigurationPath } from "@/component/configuration/use-replace-configuration-path";
import type {
    TenantLocationDirectoryResponse,
    TenantLocationRecord,
    TenantScopeRecord
} from "@/lib/auth/types";
import { parseErrorDetail } from "@/lib/api/parse-error-detail";

type Props = {
    locale: string;
    currentScope: TenantScopeRecord | null;
    hasAnyScope: boolean;
    initialLocationDirectory: TenantLocationDirectoryResponse | null;
    copy: Record<string, string>;
};

type SelectedLocationKey = number | "new" | null;

type LocationNestNodeProps = {
    item: TenantLocationRecord;
    childrenByParent: Map<number | null, TenantLocationRecord[]>;
    selectedLocationId: number | null;
    createParentId: number | null;
    isCreateMode: boolean;
    isBusy: boolean;
    maxDepth: number;
    createChildAriaLabel: string;
    onSelect: (location: TenantLocationRecord) => void;
    onCreate: (parentId: number | null) => void;
};

function parseLocationKey(raw: string | null): SelectedLocationKey {
    if (raw === "new") {
        return "new";
    }

    const parsed = Number(raw);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function resolveLocationLabel(item: TenantLocationRecord) {
    return item.name.trim() || item.display_name.trim() || `#${item.id}`;
}

function resolveLocationToneRatio(depth: number, maxDepth: number) {
    if (maxDepth <= 0) {
        return 0;
    }

    return Math.max(0, Math.min(depth / maxDepth, 1));
}

function buildLocationToneStyle(depth: number, maxDepth: number): CSSProperties {
    const toneRatio = resolveLocationToneRatio(depth, maxDepth);
    return {
        "--ui-location-depth": String(depth),
        "--ui-location-tone-light-share": `${((1 - toneRatio) * 100).toFixed(3)}%`,
        "--ui-location-tone-dark-share": `${(toneRatio * 100).toFixed(3)}%`
    } as CSSProperties;
}

function LocationNestNode({
    item,
    childrenByParent,
    selectedLocationId,
    createParentId,
    isCreateMode,
    isBusy,
    maxDepth,
    createChildAriaLabel,
    onSelect,
    onCreate
}: LocationNestNodeProps) {
    const childList = childrenByParent.get(item.id) ?? [];
    const label = resolveLocationLabel(item);
    const description = item.display_name.trim();
    const isSelected = !isCreateMode && item.id === selectedLocationId;
    const isCreateContext = isCreateMode && createParentId === item.id;

    const containerClassName =
        item.depth === 0 ? "ui-directory-item" : "ui-location-nest-box";

    return (
        <section
            className={containerClassName}
            data-selected={isSelected ? "true" : undefined}
            data-create-context={isCreateContext ? "true" : undefined}
            style={buildLocationToneStyle(item.depth, maxDepth)}
            onClick={(event) => {
                event.stopPropagation();
                if (isBusy) {
                    return;
                }
                onSelect(item);
            }}
        >
            <div className="ui-location-nest-head">
                <button
                    type="button"
                    className="ui-location-nest-body"
                    onClick={(event) => {
                        event.stopPropagation();
                        onSelect(item);
                    }}
                    disabled={isBusy}
                >
                    <div className="ui-location-nest-copy">
                        <p className="ui-location-nest-label">{label}</p>
                        {description && description !== label ? (
                            <p className="ui-location-nest-description">{description}</p>
                        ) : null}
                    </div>
                </button>

                {item.can_create_child ? (
                    <button
                        type="button"
                        className="ui-location-nest-create"
                        aria-label={createChildAriaLabel}
                        title={createChildAriaLabel}
                        onClick={(event) => {
                            event.stopPropagation();
                            onCreate(item.id);
                        }}
                        disabled={isBusy}
                    >
                        <span aria-hidden>+</span>
                    </button>
                ) : null}
            </div>

            {childList.length > 0 ? (
                <div className="ui-location-nest-children">
                    {childList.map((child) => (
                        <LocationNestNode
                            key={child.id}
                            item={child}
                            childrenByParent={childrenByParent}
                            selectedLocationId={selectedLocationId}
                            createParentId={createParentId}
                            isCreateMode={isCreateMode}
                            isBusy={isBusy}
                            maxDepth={maxDepth}
                            createChildAriaLabel={createChildAriaLabel}
                            onSelect={onSelect}
                            onCreate={onCreate}
                        />
                    ))}
                </div>
            ) : null}
        </section>
    );
}

export function LocationConfigurationClient({
    locale,
    currentScope,
    hasAnyScope,
    initialLocationDirectory,
    copy
}: Props) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const initialScopeId = currentScope?.id ?? initialLocationDirectory?.scope_id ?? null;
    const initialLocationKey =
        initialLocationDirectory && initialLocationDirectory.scope_id === initialScopeId
            ? parseLocationKey(searchParams.get("location"))
            : null;
    const initialItemList = initialLocationDirectory?.item_list ?? [];
    const initialSelectedLocation =
        initialLocationKey === "new"
            ? null
            : typeof initialLocationKey === "number"
                ? initialItemList.find((item) => item.id === initialLocationKey) ?? null
                : null;
    const shouldStartCreateMode = initialLocationKey === "new" || initialLocationKey == null;

    const locationPath = `/${locale}/app/configuration/location`;
    const configurationPath = `/${locale}/app/configuration`;

    const replacePath = useCallback(
        (nextPath: string) => {
            router.replace(nextPath, { scroll: false });
        },
        [router]
    );

    const [directory, setDirectory] = useState<TenantLocationDirectoryResponse | null>(
        initialLocationDirectory
    );
    const scopeId = directory?.scope_id ?? initialScopeId;
    const [selectedLocationId, setSelectedLocationId] = useState<number | null>(
        shouldStartCreateMode ? null : (initialSelectedLocation?.id ?? null)
    );
    const [isCreateMode, setIsCreateMode] = useState(shouldStartCreateMode);
    const [name, setName] = useState(
        shouldStartCreateMode ? "" : (initialSelectedLocation?.name ?? "")
    );
    const [displayName, setDisplayName] = useState(
        shouldStartCreateMode ? "" : (initialSelectedLocation?.display_name ?? "")
    );
    const [parentLocationId, setParentLocationId] = useState<number | null>(
        shouldStartCreateMode ? null : (initialSelectedLocation?.parent_location_id ?? null)
    );
    const [baseline, setBaseline] = useState({
        name: shouldStartCreateMode ? "" : (initialSelectedLocation?.name ?? ""),
        displayName: shouldStartCreateMode ? "" : (initialSelectedLocation?.display_name ?? ""),
        parentLocationId: shouldStartCreateMode ? null : (initialSelectedLocation?.parent_location_id ?? null)
    });
    const [fieldError, setFieldError] = useState<{
        name?: string;
        displayName?: string;
    }>({});
    const [requestErrorMessage, setRequestErrorMessage] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isDeletePending, setIsDeletePending] = useState(false);
    const editorPanelElementRef = useRef<HTMLDivElement | null>(null);
    const itemList = useMemo(() => directory?.item_list ?? [], [directory]);
    const childrenByParent = useMemo(() => {
        const next = new Map<number | null, TenantLocationRecord[]>();
        for (const item of itemList) {
            const parentId = item.parent_location_id ?? null;
            const current = next.get(parentId) ?? [];
            current.push(item);
            next.set(parentId, current);
        }
        return next;
    }, [itemList]);
    const rootLocationList = useMemo(
        () => childrenByParent.get(null) ?? [],
        [childrenByParent]
    );
    const maxLocationDepth = useMemo(
        () => itemList.reduce((maxDepth, item) => Math.max(maxDepth, item.depth), 0),
        [itemList]
    );

    const selectedLocation = useMemo(() => {
        if (isCreateMode) {
            return null;
        }
        return itemList.find((item) => item.id === selectedLocationId) ?? null;
    }, [isCreateMode, itemList, selectedLocationId]);

    const structureParentLabel = useMemo(() => {
        if (parentLocationId == null) {
            return copy.sectionStructureParentRoot;
        }
        const parentItem = itemList.find((item) => item.id === parentLocationId);
        return parentItem ? resolveLocationLabel(parentItem) : copy.sectionStructureParentRoot;
    }, [copy.sectionStructureParentRoot, itemList, parentLocationId]);

    const structureLevelDisplay = useMemo(() => {
        let depth = 0;
        if (isCreateMode) {
            if (parentLocationId != null) {
                const parentItem = itemList.find((item) => item.id === parentLocationId);
                depth = parentItem ? parentItem.depth + 1 : 0;
            }
        } else if (selectedLocation) {
            depth = selectedLocation.depth;
        }
        return String(depth + 1);
    }, [isCreateMode, itemList, parentLocationId, selectedLocation]);

    const selectedLocationKey: SelectedLocationKey = isCreateMode
        ? "new"
        : (selectedLocation?.id ?? null);

    useReplaceConfigurationPath(
        locationPath,
        searchParams,
        replacePath,
        "location",
        selectedLocationKey
    );

    const editorFlashKey = useMemo(() => {
        if (!directory) {
            return null;
        }

        if (isCreateMode) {
            return `new:${String(parentLocationId ?? "root")}`;
        }

        if (!selectedLocation) {
            return null;
        }

        return `id:${String(selectedLocation.id)}:name:${selectedLocation.name}:display:${selectedLocation.display_name}:parent:${String(selectedLocation.parent_location_id ?? "root")}`;
    }, [directory, isCreateMode, parentLocationId, selectedLocation]);

    const isEditorFlashActive = useEditorPanelFlash(editorPanelElementRef, editorFlashKey);

    const syncEditor = useCallback(
        (
            location: TenantLocationRecord | null,
            createMode: boolean,
            draftParentId: number | null
        ) => {
            setIsCreateMode(createMode);
            setSelectedLocationId(location?.id ?? null);
            setName(createMode ? "" : (location?.name ?? ""));
            setDisplayName(createMode ? "" : (location?.display_name ?? ""));
            setParentLocationId(
                createMode ? draftParentId : (location?.parent_location_id ?? null)
            );
            setBaseline({
                name: createMode ? "" : (location?.name ?? ""),
                displayName: createMode ? "" : (location?.display_name ?? ""),
                parentLocationId: createMode
                    ? draftParentId
                    : (location?.parent_location_id ?? null)
            });
            setFieldError({});
            setRequestErrorMessage(null);
            setIsDeletePending(false);
        },
        []
    );

    const isDirty =
        name.trim() !== baseline.name.trim() ||
        displayName.trim() !== baseline.displayName.trim() ||
        parentLocationId !== baseline.parentLocationId ||
        isDeletePending;

    const canEditForm = isCreateMode
        ? (directory?.can_create ?? false)
        : (selectedLocation?.can_edit ?? false);
    const canSubmit = directoryEditorCanSubmitForDirectoryEditor({
        isCreateMode,
        isDeletePending,
        canCreate: directory?.can_create ?? false,
        canEdit: selectedLocation?.can_edit ?? false
    });
    const footerErrorMessage =
        requestErrorMessage ?? fieldError.name ?? fieldError.displayName ?? null;

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

    const handleStartCreate = useCallback(
        (draftParentId: number | null) => {
            const canCreateTarget =
                draftParentId == null
                    ? (directory?.can_create ?? false)
                    : (itemList.find((item) => item.id === draftParentId)?.can_create_child ??
                        false);

            if (!canCreateTarget) {
                return;
            }
            if (isDirty && !window.confirm(copy.discardConfirm)) {
                return;
            }
            syncEditor(null, true, draftParentId);
        },
        [copy.discardConfirm, directory?.can_create, isDirty, itemList, syncEditor]
    );

    const handleSelectLocation = useCallback(
        (location: TenantLocationRecord) => {
            if (!isCreateMode && location.id === selectedLocation?.id) {
                return;
            }
            if (isDirty && !window.confirm(copy.discardConfirm)) {
                return;
            }
            syncEditor(location, false, null);
        },
        [copy.discardConfirm, isCreateMode, isDirty, selectedLocation?.id, syncEditor]
    );

    const handleSave = useCallback(async () => {
        if (!directory || scopeId == null) {
            return;
        }
        setRequestErrorMessage(null);
        if (!isDeletePending && !validate()) {
            return;
        }

        setIsSaving(true);
        const endpoint = isCreateMode
            ? `/api/auth/tenant/current/scopes/${scopeId}/locations`
            : `/api/auth/tenant/current/scopes/${scopeId}/locations/${selectedLocation?.id}`;
        const response = await fetch(
            endpoint,
            isDeletePending
                ? { method: "DELETE" }
                : {
                    method: isCreateMode ? "POST" : "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        name: name.trim(),
                        display_name: displayName.trim(),
                        parent_location_id: parentLocationId
                    })
                }
        );
        const data: unknown = await response.json().catch(() => ({}));
        setIsSaving(false);

        if (!response.ok) {
            setRequestErrorMessage(parseErrorDetail(data));
            return;
        }

        const nextDirectory = data as TenantLocationDirectoryResponse;
        setDirectory(nextDirectory);
        syncEditor(null, true, null);
    }, [
        directory,
        displayName,
        isCreateMode,
        isDeletePending,
        name,
        parentLocationId,
        scopeId,
        selectedLocation?.id,
        syncEditor,
        validate
    ]);

    return (
        <ConfigurationDirectoryEditorShell
            headerTitle={copy.title}
            headerDescription={copy.description}
            editorPanelRef={editorPanelElementRef}
            isDeletePending={isDeletePending}
            directoryAside={
                <>
                    {!directory ? (
                        <div className="ui-panel ui-empty-panel">
                            {hasAnyScope ? copy.missingCurrentScope : copy.emptyScope}
                        </div>
                    ) : null}

                    {directory && !directory.can_edit ? (
                        <div className="ui-notice-attention ui-notice-block">
                            {copy.readOnlyNotice}
                        </div>
                    ) : null}

                    <div className="ui-directory-list ui-location-nest-list">
                        {directory?.can_create ? (
                            <DirectoryCreateToolbarButton
                                label={copy.newLabel}
                                toneStyle={buildLocationToneStyle(0, maxLocationDepth)}
                                active={isCreateMode && parentLocationId == null}
                                disabled={isSaving}
                                onClick={() => handleStartCreate(null)}
                            />
                        ) : null}

                        {rootLocationList.map((item) => (
                            <LocationNestNode
                                key={item.id}
                                item={item}
                                childrenByParent={childrenByParent}
                                selectedLocationId={selectedLocation?.id ?? null}
                                createParentId={isCreateMode ? parentLocationId : null}
                                isCreateMode={isCreateMode}
                                isBusy={isSaving}
                                maxDepth={maxLocationDepth}
                                createChildAriaLabel={copy.newChild}
                                onSelect={handleSelectLocation}
                                onCreate={(draftParentId) => handleStartCreate(draftParentId)}
                            />
                        ))}

                        {directory && itemList.length === 0 ? (
                            <div className="ui-panel ui-empty-panel">{copy.empty}</div>
                        ) : null}
                    </div>
                </>
            }
            editorForm={
                <>
                    <ConfigurationNameDisplayNameFields
                        nameInputId="location-name"
                        displayTextareaId="location-display-name"
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
                        onAfterFieldEdit={() => setRequestErrorMessage(null)}
                    />

                    {directory ? (
                        <ConfigurationInfoSection
                            title={copy.sectionStructureTitle}
                            description={copy.sectionStructureDescription}
                        >
                            <ul className="ui-info-topic-list">
                                <li>
                                    <p className="ui-info-topic-lead">
                                        <span className="ui-info-topic-label">
                                            {copy.sectionStructureLevelLabel}
                                        </span>
                                        {": "}
                                        <span className="ui-info-topic-value">
                                            {structureLevelDisplay}
                                        </span>
                                    </p>
                                    <p className="ui-field-hint ui-info-topic-hint">
                                        {copy.sectionStructureLevelHint}
                                    </p>
                                </li>
                                <li>
                                    <p className="ui-info-topic-lead">
                                        <span className="ui-info-topic-label">
                                            {copy.sectionStructureOrderLabel}
                                        </span>
                                        {": "}
                                        <span className="ui-info-topic-value">
                                            {isCreateMode || !selectedLocation
                                                ? copy.sectionStructureOrderPending
                                                : String(selectedLocation.sort_order)}
                                        </span>
                                    </p>
                                    <p className="ui-field-hint ui-info-topic-hint">
                                        {isCreateMode || !selectedLocation
                                            ? copy.sectionStructureOrderHintCreate
                                            : copy.sectionStructureOrderHintEdit}
                                    </p>
                                </li>
                                <li>
                                    <p className="ui-info-topic-lead">
                                        <span className="ui-info-topic-label">
                                            {copy.sectionStructureParentLabel}
                                        </span>
                                        {": "}
                                        <span className="ui-info-topic-value">
                                            {structureParentLabel}
                                        </span>
                                    </p>
                                </li>
                            </ul>
                        </ConfigurationInfoSection>
                    ) : null}
                </>
            }
            history={{
                headingId: "location-history-heading",
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
                    hasEditableContext: Boolean(directory),
                    canSubmit,
                    isSaving,
                    isDirty
                }),
                saveLabel: copy.save,
                savingLabel: copy.saving,
                isSaving,
                dangerAction:
                    !isCreateMode && selectedLocation ? (
                        <button
                            type="button"
                            className="ui-button-danger"
                            onClick={() => setIsDeletePending((previous) => !previous)}
                            disabled={isSaving}
                        >
                            {isDeletePending ? copy.undoDelete : copy.delete}
                        </button>
                    ) : null
            }}
        />
    );
}
