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
import { BuildingIcon, HistoryIcon, PreviewIcon } from "@/component/ui/ui-icons";
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

const APP_SHELL_MAIN_SCROLL_SELECTOR = ".ui-shell-main-scroll";

function isOverflowYScrollable(element: HTMLElement): boolean {
    const style = window.getComputedStyle(element);
    const overflowY = style.overflowY;
    const canScroll =
        overflowY === "auto" ||
        overflowY === "scroll" ||
        overflowY === "overlay";
    return canScroll && element.scrollHeight > element.clientHeight;
}

function resolveEditorScrollport(panel: HTMLElement): HTMLElement | null {
    const byShell = panel.closest(APP_SHELL_MAIN_SCROLL_SELECTOR);
    if (byShell instanceof HTMLElement) {
        return byShell;
    }
    let current: HTMLElement | null = panel.parentElement;
    while (current) {
        if (isOverflowYScrollable(current)) {
            return current;
        }
        current = current.parentElement;
    }
    return null;
}

/** Topo do painel já está na zona útil do scrollport (mesma folga que scroll-margin-top do painel). */
function isEditorPanelTopVisibleInScrollport(panel: HTMLElement): boolean {
    const scrollport = resolveEditorScrollport(panel);
    const panelRect = panel.getBoundingClientRect();
    const marginTopPx =
        Number.parseFloat(window.getComputedStyle(panel).scrollMarginTop) || 0;
    const epsilonPx = 0.5;

    if (scrollport) {
        const scrollRect = scrollport.getBoundingClientRect();
        return panelRect.top >= scrollRect.top + marginTopPx - epsilonPx;
    }

    return panelRect.top >= marginTopPx - epsilonPx;
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
    const [isEditorFlashActive, setIsEditorFlashActive] = useState(false);
    const editorFlashStartTimeoutRef = useRef<number | null>(null);
    const editorFlashHideTimeoutRef = useRef<number | null>(null);
    const editorFlashCancelAfterScrollRef = useRef<(() => void) | null>(null);
    const previousEditorFlashKeyRef = useRef<string | null>(null);
    const editorPanelElementRef = useRef<HTMLDivElement | null>(null);
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
        editorFlashCancelAfterScrollRef.current?.();
        editorFlashCancelAfterScrollRef.current = null;

        setIsEditorFlashActive(false);
        editorFlashStartTimeoutRef.current = window.setTimeout(() => {
            editorFlashStartTimeoutRef.current = null;

            const panel = editorPanelElementRef.current;
            if (!panel) {
                return;
            }

            let aborted = false;
            let flashStarted = false;
            const FLASH_MS = 960;
            const SCROLL_END_FALLBACK_MS = 900;
            const scrollEndSupported =
                typeof Document !== "undefined" && "onscrollend" in Document.prototype;

            let fallbackTimeoutId = 0;

            const cleanupWait = () => {
                window.clearTimeout(fallbackTimeoutId);
                document.removeEventListener("scrollend", onScrollEnd);
                editorFlashCancelAfterScrollRef.current = null;
            };

            const startFlash = () => {
                if (aborted || flashStarted) {
                    return;
                }
                flashStarted = true;
                cleanupWait();
                setIsEditorFlashActive(true);
                editorFlashHideTimeoutRef.current = window.setTimeout(() => {
                    setIsEditorFlashActive(false);
                    editorFlashHideTimeoutRef.current = null;
                }, FLASH_MS);
            };

            const onScrollEnd = () => {
                startFlash();
            };

            if (isEditorPanelTopVisibleInScrollport(panel)) {
                startFlash();
                return;
            }

            panel.scrollIntoView({
                behavior: "smooth",
                block: "start",
                inline: "nearest"
            });

            if (scrollEndSupported) {
                document.addEventListener("scrollend", onScrollEnd, { passive: true });
            }
            const fallbackMs = scrollEndSupported ? SCROLL_END_FALLBACK_MS : 480;
            fallbackTimeoutId = window.setTimeout(startFlash, fallbackMs);

            editorFlashCancelAfterScrollRef.current = () => {
                aborted = true;
                cleanupWait();
            };
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

        // Primeira chave válida após montagem ou após perder o diretório: só sincroniza a ref, sem flash.
        if (previousEditorFlashKeyRef.current === null) {
            previousEditorFlashKeyRef.current = editorFlashKey;
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
            editorFlashCancelAfterScrollRef.current?.();
            editorFlashCancelAfterScrollRef.current = null;
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

    return (
        <section className="ui-page-stack ui-page-stack-footer">
            <PageHeader title={copy.title} description={copy.description} />

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
                        {directory?.can_create ? (
                            <div className="ui-location-nest-list-toolbar">
                                <button
                                    type="button"
                                    className="ui-location-nest-create"
                                    style={buildLocationToneStyle(0, maxLocationDepth)}
                                    aria-label={copy.newLabel}
                                    title={copy.newLabel}
                                    data-active={
                                        isCreateMode && parentLocationId == null
                                            ? "true"
                                            : undefined
                                    }
                                    onClick={() => handleStartCreate(null)}
                                    disabled={isSaving}
                                >
                                    <span aria-hidden>+</span>
                                </button>
                            </div>
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
                </aside>

                <div
                    ref={editorPanelElementRef}
                    className="ui-panel ui-panel-editor ui-editor-panel"
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

                        {directory ? (
                            <section className="ui-card ui-form-section ui-border-accent">
                                <div className="ui-editor-content">
                                    <div className="ui-section-header">
                                        <span className="ui-icon-badge">
                                            <BuildingIcon className="ui-icon" />
                                        </span>
                                        <div className="ui-section-copy">
                                            <h2 className="ui-header-title ui-title-section">
                                                {copy.sectionStructureTitle}
                                            </h2>
                                            <p className="ui-copy-body">
                                                {copy.sectionStructureDescription}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="ui-form-fields ui-form-fields-2">
                                        <div className="ui-field">
                                            <label
                                                className="ui-field-label"
                                                htmlFor="location-structure-level"
                                            >
                                                {copy.sectionStructureLevelLabel}
                                            </label>
                                            <input
                                                id="location-structure-level"
                                                className="ui-input"
                                                value={structureLevelDisplay}
                                                disabled
                                                readOnly
                                            />
                                            <p className="ui-field-hint">
                                                {copy.sectionStructureLevelHint}
                                            </p>
                                        </div>

                                        <div className="ui-field">
                                            <label
                                                className="ui-field-label"
                                                htmlFor="location-structure-order"
                                            >
                                                {copy.sectionStructureOrderLabel}
                                            </label>
                                            <input
                                                id="location-structure-order"
                                                className="ui-input"
                                                value={
                                                    isCreateMode || !selectedLocation
                                                        ? copy.sectionStructureOrderPending
                                                        : String(selectedLocation.sort_order)
                                                }
                                                disabled
                                                readOnly
                                            />
                                            <p className="ui-field-hint">
                                                {isCreateMode || !selectedLocation
                                                    ? copy.sectionStructureOrderHintCreate
                                                    : copy.sectionStructureOrderHintEdit}
                                            </p>
                                        </div>

                                        <div className="ui-field ui-field-span-full">
                                            <label
                                                className="ui-field-label"
                                                htmlFor="location-structure-parent"
                                            >
                                                {copy.sectionStructureParentLabel}
                                            </label>
                                            <input
                                                id="location-structure-parent"
                                                className="ui-input"
                                                value={structureParentLabel}
                                                disabled
                                                readOnly
                                            />
                                        </div>
                                    </div>
                                </div>
                            </section>
                        ) : null}
                    </div>
                </div>
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
