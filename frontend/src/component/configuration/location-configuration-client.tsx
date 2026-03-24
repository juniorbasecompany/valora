"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState
} from "react";
import type { CSSProperties, MouseEvent } from "react";
import { createPortal } from "react-dom";

import { PageHeader } from "@/component/app-shell/page-header";
import { StatusPanel } from "@/component/app-shell/status-panel";
import {
    HistoryIcon,
    PreviewIcon
} from "@/component/ui/ui-icons";
import type {
    TenantLocationDirectoryResponse,
    TenantLocationRecord,
    TenantScopeRecord
} from "@/lib/auth/types";

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
    newLabel: string;
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

function buildPath(
    basePath: string,
    locationKey: SelectedLocationKey
) {
    const params = new URLSearchParams();
    if (locationKey === "new") {
        params.set("location", "new");
    } else if (typeof locationKey === "number") {
        params.set("location", String(locationKey));
    }
    const query = params.toString();
    return query ? `${basePath}?${query}` : basePath;
}

function parseErrorDetail(payload: unknown) {
    if (!payload || typeof payload !== "object") {
        return null;
    }

    const detail = (payload as { detail?: unknown }).detail;
    if (typeof detail === "string" && detail.trim()) {
        return detail;
    }

    if (Array.isArray(detail) && detail.length > 0) {
        const first = detail[0] as { msg?: string };
        if (typeof first?.msg === "string" && first.msg.trim()) {
            return first.msg;
        }
    }

    return null;
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
    newLabel,
    onSelect,
    onCreate
}: LocationNestNodeProps) {
    const childList = childrenByParent.get(item.id) ?? [];
    const label = resolveLocationLabel(item);
    const description = item.display_name.trim();
    const isSelected = !isCreateMode && item.id === selectedLocationId;
    const isCreateContext = isCreateMode && createParentId === item.id;

    return (
        <section
            className="ui-location-nest-box"
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
                            newLabel={newLabel}
                            onSelect={onSelect}
                            onCreate={onCreate}
                        />
                    ))}
                </div>
            ) : null}

            {item.can_create_child ? (
                <div className="ui-location-nest-footer">
                    <button
                        type="button"
                        className="ui-location-nest-create"
                        style={buildLocationToneStyle(
                            Math.min(item.depth + 1, maxDepth),
                            maxDepth
                        )}
                        onClick={(event) => {
                            event.stopPropagation();
                            onCreate(item.id);
                        }}
                        disabled={isBusy}
                    >
                        {newLabel}
                    </button>
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
    const [isEditorFlashActive, setIsEditorFlashActive] = useState(false);
    const editorFlashStartTimeoutRef = useRef<number | null>(null);
    const editorFlashHideTimeoutRef = useRef<number | null>(null);
    const previousEditorFlashKeyRef = useRef<string | null>(null);
    const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
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

    const selectedLocationKey: SelectedLocationKey = isCreateMode
        ? "new"
        : (selectedLocation?.id ?? null);

    useEffect(() => {
        setPortalTarget(document.getElementById("app-shell-footer-slot"));
    }, []);

    useEffect(() => {
        const currentQuery = searchParams.toString();
        const currentPath = currentQuery ? `${locationPath}?${currentQuery}` : locationPath;
        const nextPath = buildPath(locationPath, selectedLocationKey);
        if (currentPath !== nextPath) {
            replacePath(nextPath);
        }
    }, [locationPath, replacePath, searchParams, selectedLocationKey]);

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
    const canSubmit = isCreateMode
        ? (directory?.can_create ?? false)
        : isDeletePending
            ? true
            : (selectedLocation?.can_edit ?? false);
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

    const triggerEditorFlash = useCallback(() => {
        if (editorFlashStartTimeoutRef.current != null) {
            window.clearTimeout(editorFlashStartTimeoutRef.current);
            editorFlashStartTimeoutRef.current = null;
        }
        if (editorFlashHideTimeoutRef.current != null) {
            window.clearTimeout(editorFlashHideTimeoutRef.current);
            editorFlashHideTimeoutRef.current = null;
        }

        setIsEditorFlashActive(false);
        editorFlashStartTimeoutRef.current = window.setTimeout(() => {
            setIsEditorFlashActive(true);
            editorFlashStartTimeoutRef.current = null;
            editorFlashHideTimeoutRef.current = window.setTimeout(() => {
                setIsEditorFlashActive(false);
                editorFlashHideTimeoutRef.current = null;
            }, 960);
        }, 24);
    }, []);

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

    useEffect(() => {
        if (!editorFlashKey) {
            previousEditorFlashKeyRef.current = null;
            return;
        }

        if (previousEditorFlashKeyRef.current === editorFlashKey) {
            return;
        }

        previousEditorFlashKeyRef.current = editorFlashKey;
        triggerEditorFlash();
    }, [editorFlashKey, triggerEditorFlash]);

    useEffect(() => {
        return () => {
            if (editorFlashStartTimeoutRef.current != null) {
                window.clearTimeout(editorFlashStartTimeoutRef.current);
            }
            if (editorFlashHideTimeoutRef.current != null) {
                window.clearTimeout(editorFlashHideTimeoutRef.current);
            }
        };
    }, []);

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

    const pageTitle = isCreateMode
        ? copy.newLocationTitle
        : selectedLocation?.name ?? copy.title;

    return (
        <section className="ui-page-stack ui-page-stack-footer">
            <PageHeader
                title={pageTitle}
                description={copy.description}
                actionSlot={
                    <StatusPanel
                        title={copy.statusTitle}
                        description={copy.statusDescription}
                        tone="neutral"
                    />
                }
            />

            <div className="ui-layout-directory ui-layout-directory-editor">
                <aside className="ui-panel ui-stack-lg ui-panel-context-card">
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
                                newLabel={copy.newLabel}
                                onSelect={handleSelectLocation}
                                onCreate={(draftParentId) => handleStartCreate(draftParentId)}
                            />
                        ))}

                        {directory && itemList.length === 0 ? (
                            <div className="ui-panel ui-empty-panel">{copy.empty}</div>
                        ) : null}

                        {directory?.can_create ? (
                            <button
                                type="button"
                                className="ui-location-nest-create"
                                style={buildLocationToneStyle(0, maxLocationDepth)}
                                data-active={
                                    isCreateMode && parentLocationId == null ? "true" : undefined
                                }
                                onClick={() => handleStartCreate(null)}
                                disabled={isSaving}
                            >
                                {copy.newLabel}
                            </button>
                        ) : null}
                    </div>
                </aside>

                <div
                    className="ui-panel ui-panel-editor ui-editor-panel-sticky ui-editor-panel"
                    data-delete-pending={isDeletePending ? "true" : undefined}
                >
                    <div className="ui-editor-panel-body">
                        <section className="ui-card ui-form-section ui-border-accent">
                            {isEditorFlashActive ? (
                                <>
                                    <span
                                        aria-hidden
                                        className="ui-editor-flash-ring"
                                    />
                                    <span
                                        aria-hidden
                                        className="ui-editor-flash-fill"
                                    />
                                </>
                            ) : null}

                            <div className="ui-editor-content">
                                <div className="ui-section-header">
                                    <span className="ui-icon-badge">
                                        <PreviewIcon className="ui-icon" />
                                    </span>
                                    <div className="ui-section-copy">
                                        <h2 className="ui-header-title ui-title-section">
                                            {copy.sectionIdentityTitle}
                                        </h2>
                                        <p className="ui-copy-body">
                                            {copy.sectionIdentityDescription}
                                        </p>
                                    </div>
                                </div>

                                <div className="ui-form-fields">
                                    <div className="ui-field">
                                        <label className="ui-field-label" htmlFor="location-name">
                                            {copy.nameLabel}
                                        </label>
                                        <input
                                            id="location-name"
                                            className="ui-input"
                                            value={name}
                                            onChange={(event) => {
                                                setName(event.target.value);
                                                setFieldError((previous) => ({
                                                    ...previous,
                                                    name: undefined
                                                }));
                                                setRequestErrorMessage(null);
                                            }}
                                            disabled={isDeletePending || !canEditForm}
                                            aria-invalid={Boolean(fieldError.name)}
                                        />
                                        <p className="ui-field-hint">{copy.nameHint}</p>
                                        {fieldError.name ? (
                                            <p className="ui-field-error">{fieldError.name}</p>
                                        ) : null}
                                    </div>

                                    <div className="ui-field">
                                        <label
                                            className="ui-field-label"
                                            htmlFor="location-display-name"
                                        >
                                            {copy.displayNameLabel}
                                        </label>
                                        <textarea
                                            id="location-display-name"
                                            className="ui-input ui-input-textarea"
                                            value={displayName}
                                            onChange={(event) => {
                                                setDisplayName(event.target.value);
                                                setFieldError((previous) => ({
                                                    ...previous,
                                                    displayName: undefined
                                                }));
                                                setRequestErrorMessage(null);
                                            }}
                                            disabled={isDeletePending || !canEditForm}
                                            aria-invalid={Boolean(fieldError.displayName)}
                                        />
                                        <p className="ui-field-hint">{copy.displayNameHint}</p>
                                        {fieldError.displayName ? (
                                            <p className="ui-field-error">
                                                {fieldError.displayName}
                                            </p>
                                        ) : null}
                                    </div>
                                </div>
                            </div>
                        </section>
                    </div>
                </div>

                <aside className="ui-panel-context">
                    {selectedLocation && !isCreateMode ? (
                        <div className="ui-panel ui-panel-context ui-panel-context-body">
                            <div className="ui-metadata-grid">
                                <div className="ui-metadata-card">
                                    <p className="ui-metadata-label">{copy.metadataIdLabel}</p>
                                    <p className="ui-metadata-value-strong">
                                        {selectedLocation.id}
                                    </p>
                                </div>
                                <div className="ui-metadata-card">
                                    <p className="ui-metadata-label">{copy.metadataPathLabel}</p>
                                    <p className="ui-metadata-value">
                                        {selectedLocation.path_labels.join(" / ")}
                                    </p>
                                </div>
                                <div className="ui-metadata-grid ui-metadata-grid-2">
                                    <div className="ui-metadata-card">
                                        <p className="ui-metadata-label">
                                            {copy.metadataChildrenLabel}
                                        </p>
                                        <p className="ui-metadata-value-strong">
                                            {selectedLocation.children_count}
                                        </p>
                                    </div>
                                    <div className="ui-metadata-card">
                                        <p className="ui-metadata-label">
                                            {copy.metadataDescendantsLabel}
                                        </p>
                                        <p className="ui-metadata-value-strong">
                                            {selectedLocation.descendants_count}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : null}
                </aside>
            </div>

            <section className="ui-card ui-card-coming-soon ui-panel-body-compact">
                <div className="ui-section-header">
                    <span className="ui-icon-badge ui-icon-badge-construction">
                        <HistoryIcon className="ui-icon" />
                    </span>
                    <div className="ui-section-copy">
                        <h2 className="ui-header-title ui-title-section">
                            {copy.historyTitle}
                        </h2>
                        <p className="ui-copy-body">{copy.historyDescription}</p>
                    </div>
                </div>
            </section>

            {portalTarget
                ? createPortal(
                    <div className="ui-action-footer">
                        <Link
                            href={configurationPath}
                            className="ui-button-secondary"
                            onClick={(event: MouseEvent<HTMLAnchorElement>) => {
                                if (isDirty && !window.confirm(copy.discardConfirm)) {
                                    event.preventDefault();
                                }
                            }}
                        >
                            {copy.cancel}
                        </Link>
                        <div className="ui-action-footer-feedback">
                            {footerErrorMessage ? (
                                <div className="ui-notice-danger ui-notice-block ui-status-copy">
                                    {footerErrorMessage}
                                </div>
                            ) : null}
                        </div>
                        <div className="ui-action-footer-end">
                            {!isCreateMode && selectedLocation ? (
                                <button
                                    type="button"
                                    className="ui-button-danger"
                                    onClick={() => setIsDeletePending((previous) => !previous)}
                                    disabled={isSaving}
                                >
                                    {isDeletePending ? copy.undoDelete : copy.delete}
                                </button>
                            ) : null}
                            <button
                                type="button"
                                className="ui-button-primary"
                                onClick={() => void handleSave()}
                                disabled={!directory || !canSubmit || isSaving || !isDirty}
                            >
                                {isSaving ? copy.saving : copy.save}
                            </button>
                        </div>
                    </div>,
                    portalTarget
                )
                : null}
        </section>
    );
}
