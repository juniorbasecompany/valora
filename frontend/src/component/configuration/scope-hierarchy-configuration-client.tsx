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
import type { TenantScopeHierarchyItemBase, TenantScopeRecord } from "@/lib/auth/types";
import { parseErrorDetail } from "@/lib/api/parse-error-detail";

export type ScopeHierarchySavePayload = {
    name: string;
    display_name: string;
    parentId: number | null;
};

export type ScopeHierarchyDirectoryShape<TItem extends TenantScopeHierarchyItemBase> = {
    scope_id: number;
    scope_name: string;
    scope_display_name: string;
    can_edit: boolean;
    can_create: boolean;
    item_list: TItem[];
};

export type ScopeHierarchyConfigurationClientProps<
    TItem extends TenantScopeHierarchyItemBase,
    TDirectory extends ScopeHierarchyDirectoryShape<TItem>
> = {
    locale: string;
    currentScope: TenantScopeRecord | null;
    hasAnyScope: boolean;
    initialDirectory: TDirectory | null;
    copy: Record<string, string>;
    configurationSegment: string;
    queryParamKey: string;
    apiSegment: string;
    formIds: {
        nameInput: string;
        displayTextarea: string;
        historyHeading: string;
    };
    getParentId: (item: TItem) => number | null;
    buildSavePayload: (input: ScopeHierarchySavePayload) => Record<string, unknown>;
};

type SelectedHierarchyKey = number | "new" | null;

type HierarchyNestNodeProps<TItem extends TenantScopeHierarchyItemBase> = {
    item: TItem;
    childrenByParent: Map<number | null, TItem[]>;
    selectedItemId: number | null;
    createParentId: number | null;
    isCreateMode: boolean;
    isBusy: boolean;
    maxDepth: number;
    createChildAriaLabel: string;
    resolveLabel: (item: TItem) => string;
    onSelect: (item: TItem) => void;
    onCreate: (parentId: number | null) => void;
};

function parseHierarchySelectionKey(raw: string | null): SelectedHierarchyKey {
    if (raw === "new") {
        return "new";
    }

    const parsed = Number(raw);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function resolveHierarchyLabel(item: TenantScopeHierarchyItemBase) {
    return item.name.trim() || item.display_name.trim() || `#${item.id}`;
}

function resolveHierarchyToneRatio(depth: number, maxDepth: number) {
    const normalizedDepth = Math.max(depth - 1, 0);
    const normalizedMaxDepth = Math.max(maxDepth - 1, 0);

    if (normalizedMaxDepth <= 0) {
        return 0;
    }

    return Math.max(0, Math.min(normalizedDepth / normalizedMaxDepth, 1));
}

function buildHierarchyToneStyle(depth: number, maxDepth: number): CSSProperties {
    const toneRatio = resolveHierarchyToneRatio(depth, maxDepth);
    return {
        "--ui-location-depth": String(depth),
        "--ui-location-tone-light-share": `${((1 - toneRatio) * 100).toFixed(3)}%`,
        "--ui-location-tone-dark-share": `${(toneRatio * 100).toFixed(3)}%`
    } as CSSProperties;
}

function HierarchyNestNode<TItem extends TenantScopeHierarchyItemBase>({
    item,
    childrenByParent,
    selectedItemId,
    createParentId,
    isCreateMode,
    isBusy,
    maxDepth,
    createChildAriaLabel,
    resolveLabel,
    onSelect,
    onCreate
}: HierarchyNestNodeProps<TItem>) {
    const childList = childrenByParent.get(item.id) ?? [];
    const label = resolveLabel(item);
    const description = item.display_name.trim();
    const isSelected = !isCreateMode && item.id === selectedItemId;
    const isCreateContext = isCreateMode && createParentId === item.id;

    const containerClassName =
        item.depth === 0 ? "ui-directory-item" : "ui-location-nest-box";

    return (
        <section
            className={containerClassName}
            data-selected={isSelected ? "true" : undefined}
            data-create-context={isCreateContext ? "true" : undefined}
            style={buildHierarchyToneStyle(item.depth, maxDepth)}
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
                        <HierarchyNestNode
                            key={child.id}
                            item={child}
                            childrenByParent={childrenByParent}
                            selectedItemId={selectedItemId}
                            createParentId={createParentId}
                            isCreateMode={isCreateMode}
                            isBusy={isBusy}
                            maxDepth={maxDepth}
                            createChildAriaLabel={createChildAriaLabel}
                            resolveLabel={resolveLabel}
                            onSelect={onSelect}
                            onCreate={onCreate}
                        />
                    ))}
                </div>
            ) : null}
        </section>
    );
}

export function ScopeHierarchyConfigurationClient<
    TItem extends TenantScopeHierarchyItemBase,
    TDirectory extends ScopeHierarchyDirectoryShape<TItem>
>({
    locale,
    currentScope,
    hasAnyScope,
    initialDirectory,
    copy,
    configurationSegment,
    queryParamKey,
    apiSegment,
    formIds,
    getParentId,
    buildSavePayload
}: ScopeHierarchyConfigurationClientProps<TItem, TDirectory>) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const initialScopeId = currentScope?.id ?? initialDirectory?.scope_id ?? null;
    const initialItemKey =
        initialDirectory && initialDirectory.scope_id === initialScopeId
            ? parseHierarchySelectionKey(searchParams.get(queryParamKey))
            : null;
    const initialItemList = initialDirectory?.item_list ?? [];
    const initialSelectedItem =
        initialItemKey === "new"
            ? null
            : typeof initialItemKey === "number"
                ? initialItemList.find((item) => item.id === initialItemKey) ?? null
                : null;
    const shouldStartCreateMode = initialItemKey === "new" || initialItemKey == null;

    const basePath = `/${locale}/app/configuration/${configurationSegment}`;
    const configurationPath = `/${locale}/app/configuration`;

    const replacePath = useCallback(
        (nextPath: string) => {
            router.replace(nextPath, { scroll: false });
        },
        [router]
    );

    const [directory, setDirectory] = useState<TDirectory | null>(
        initialDirectory as TDirectory | null
    );
    const scopeId = directory?.scope_id ?? initialScopeId;
    const [selectedItemId, setSelectedItemId] = useState<number | null>(
        shouldStartCreateMode ? null : (initialSelectedItem?.id ?? null)
    );
    const [isCreateMode, setIsCreateMode] = useState(shouldStartCreateMode);
    const [name, setName] = useState(
        shouldStartCreateMode ? "" : (initialSelectedItem?.name ?? "")
    );
    const [displayName, setDisplayName] = useState(
        shouldStartCreateMode ? "" : (initialSelectedItem?.display_name ?? "")
    );
    const [parentId, setParentId] = useState<number | null>(
        shouldStartCreateMode ? null : (initialSelectedItem ? getParentId(initialSelectedItem) : null)
    );
    const [baseline, setBaseline] = useState({
        name: shouldStartCreateMode ? "" : (initialSelectedItem?.name ?? ""),
        displayName: shouldStartCreateMode ? "" : (initialSelectedItem?.display_name ?? ""),
        parentId: shouldStartCreateMode
            ? null
            : (initialSelectedItem ? getParentId(initialSelectedItem) : null)
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
        const next = new Map<number | null, TItem[]>();
        for (const item of itemList) {
            const pId = getParentId(item) ?? null;
            const current = next.get(pId) ?? [];
            current.push(item);
            next.set(pId, current);
        }
        return next;
    }, [getParentId, itemList]);
    const rootItemList = useMemo(() => childrenByParent.get(null) ?? [], [childrenByParent]);
    const maxDepth = useMemo(
        () => itemList.reduce((max, item) => Math.max(max, item.depth), 0),
        [itemList]
    );

    const selectedItem = useMemo(() => {
        if (isCreateMode) {
            return null;
        }
        return itemList.find((item) => item.id === selectedItemId) ?? null;
    }, [isCreateMode, itemList, selectedItemId]);

    const structureParentLabel = useMemo(() => {
        if (parentId == null) {
            return copy.sectionStructureParentRoot;
        }
        const parentItem = itemList.find((item) => item.id === parentId);
        return parentItem ? resolveHierarchyLabel(parentItem) : copy.sectionStructureParentRoot;
    }, [copy.sectionStructureParentRoot, itemList, parentId]);

    const structureLevelDisplay = useMemo(() => {
        let depth = 0;
        if (isCreateMode) {
            if (parentId != null) {
                const parentItem = itemList.find((item) => item.id === parentId);
                depth = parentItem ? parentItem.depth + 1 : 0;
            }
        } else if (selectedItem) {
            depth = selectedItem.depth;
        }
        return String(depth + 1);
    }, [isCreateMode, itemList, parentId, selectedItem]);

    const selectedKey: SelectedHierarchyKey = isCreateMode ? "new" : (selectedItem?.id ?? null);

    useReplaceConfigurationPath(basePath, searchParams, replacePath, queryParamKey, selectedKey);

    const editorFlashKey = useMemo(() => {
        if (!directory) {
            return null;
        }

        if (isCreateMode) {
            return `new:${String(parentId ?? "root")}`;
        }

        if (!selectedItem) {
            return null;
        }

        return `id:${String(selectedItem.id)}:name:${selectedItem.name}:display:${selectedItem.display_name}:parent:${String(getParentId(selectedItem) ?? "root")}`;
    }, [directory, getParentId, isCreateMode, parentId, selectedItem]);

    const isEditorFlashActive = useEditorPanelFlash(editorPanelElementRef, editorFlashKey);

    const syncEditor = useCallback(
        (item: TItem | null, createMode: boolean, draftParentId: number | null) => {
            setIsCreateMode(createMode);
            setSelectedItemId(item?.id ?? null);
            setName(createMode ? "" : (item?.name ?? ""));
            setDisplayName(createMode ? "" : (item?.display_name ?? ""));
            setParentId(createMode ? draftParentId : (item ? getParentId(item) : null));
            setBaseline({
                name: createMode ? "" : (item?.name ?? ""),
                displayName: createMode ? "" : (item?.display_name ?? ""),
                parentId: createMode ? draftParentId : (item ? getParentId(item) : null)
            });
            setFieldError({});
            setRequestErrorMessage(null);
            setIsDeletePending(false);
        },
        [getParentId]
    );

    const isDirty =
        name.trim() !== baseline.name.trim() ||
        displayName.trim() !== baseline.displayName.trim() ||
        parentId !== baseline.parentId ||
        isDeletePending;

    const canEditForm = isCreateMode
        ? (directory?.can_create ?? false)
        : (selectedItem?.can_edit ?? false);
    const canSubmit = directoryEditorCanSubmitForDirectoryEditor({
        isCreateMode,
        isDeletePending,
        canCreate: directory?.can_create ?? false,
        canEdit: selectedItem?.can_edit ?? false
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

    const handleSelectItem = useCallback(
        (item: TItem) => {
            if (!isCreateMode && item.id === selectedItem?.id) {
                return;
            }
            if (isDirty && !window.confirm(copy.discardConfirm)) {
                return;
            }
            syncEditor(item, false, null);
        },
        [copy.discardConfirm, isCreateMode, isDirty, selectedItem?.id, syncEditor]
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
            ? `/api/auth/tenant/current/scopes/${scopeId}/${apiSegment}`
            : `/api/auth/tenant/current/scopes/${scopeId}/${apiSegment}/${selectedItem?.id}`;
        const response = await fetch(
            endpoint,
            isDeletePending
                ? { method: "DELETE" }
                : {
                    method: isCreateMode ? "POST" : "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(
                        buildSavePayload({
                            name: name.trim(),
                            display_name: displayName.trim(),
                            parentId
                        })
                    )
                }
        );
        const data: unknown = await response.json().catch(() => ({}));
        setIsSaving(false);

        if (!response.ok) {
            setRequestErrorMessage(parseErrorDetail(data));
            return;
        }

        const nextDirectory = data as TDirectory;
        setDirectory(nextDirectory);
        syncEditor(null, true, null);
    }, [
        apiSegment,
        buildSavePayload,
        directory,
        displayName,
        isCreateMode,
        isDeletePending,
        name,
        parentId,
        scopeId,
        selectedItem?.id,
        syncEditor,
        validate
    ]);

    const resolveLabel = useCallback((item: TItem) => resolveHierarchyLabel(item), []);

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
                                toneStyle={buildHierarchyToneStyle(0, maxDepth)}
                                active={isCreateMode && parentId == null}
                                disabled={isSaving}
                                onClick={() => handleStartCreate(null)}
                            />
                        ) : null}

                        {rootItemList.map((item) => (
                            <HierarchyNestNode
                                key={item.id}
                                item={item}
                                childrenByParent={childrenByParent}
                                selectedItemId={selectedItem?.id ?? null}
                                createParentId={isCreateMode ? parentId : null}
                                isCreateMode={isCreateMode}
                                isBusy={isSaving}
                                maxDepth={maxDepth}
                                createChildAriaLabel={copy.newChild}
                                resolveLabel={resolveLabel}
                                onSelect={handleSelectItem}
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
                        nameInputId={formIds.nameInput}
                        displayTextareaId={formIds.displayTextarea}
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
                                            {isCreateMode || !selectedItem
                                                ? copy.sectionStructureOrderPending
                                                : String(selectedItem.sort_order)}
                                        </span>
                                    </p>
                                    <p className="ui-field-hint ui-info-topic-hint">
                                        {isCreateMode || !selectedItem
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
                headingId: formIds.historyHeading,
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
                    !isCreateMode && selectedItem ? (
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
