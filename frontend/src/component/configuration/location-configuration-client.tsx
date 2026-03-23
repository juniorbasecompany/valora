"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type { DragEvent, MouseEvent } from "react";
import { createPortal } from "react-dom";

import { PageHeader } from "@/component/app-shell/page-header";
import { StatusPanel } from "@/component/app-shell/status-panel";
import {
  HistoryIcon,
  PreviewIcon,
  ScopeIcon,
  WorkflowIcon
} from "@/component/ui/ui-icons";
import type {
  TenantLocationDirectoryResponse,
  TenantLocationRecord,
  TenantScopeDirectoryResponse
} from "@/lib/auth/types";

type Props = {
  locale: string;
  initialScopeDirectory: TenantScopeDirectoryResponse;
  initialLocationDirectory: TenantLocationDirectoryResponse | null;
  copy: Record<string, string>;
};

type TabKey = "general" | "history";
type SelectedLocationKey = number | "new" | null;

function normalizeTab(raw: string | null): TabKey {
  return raw === "history" ? "history" : "general";
}

function parseScopeId(raw: string | null): number | null {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseLocationKey(raw: string | null): SelectedLocationKey {
  if (raw === "new") {
    return "new";
  }

  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function buildPath(
  basePath: string,
  tab: TabKey,
  scopeId: number | null,
  locationKey: SelectedLocationKey
) {
  const params = new URLSearchParams();
  if (tab === "history") {
    params.set("tab", "history");
  }
  if (scopeId != null) {
    params.set("scope", String(scopeId));
  }
  if (locationKey === "new") {
    params.set("location", "new");
  } else if (typeof locationKey === "number") {
    params.set("location", String(locationKey));
  }
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

function parseErrorDetail(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") {
    return fallback;
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

  return fallback;
}

function resolveLocationLabel(item: TenantLocationRecord) {
  return item.name.trim() || item.display_name.trim() || `#${item.id}`;
}

export function LocationConfigurationClient({
  locale,
  initialScopeDirectory,
  initialLocationDirectory,
  copy
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = normalizeTab(searchParams.get("tab"));
  const initialScopeId =
    initialScopeDirectory.item_list.find(
      (item) => item.id === parseScopeId(searchParams.get("scope"))
    )?.id ??
    initialScopeDirectory.item_list[0]?.id ??
    null;
  const initialLocationKey =
    initialLocationDirectory && initialLocationDirectory.scope_id === initialScopeId
      ? parseLocationKey(searchParams.get("location"))
      : null;

  const locationPath = `/${locale}/app/configuration/location`;
  const configurationPath = `/${locale}/app/configuration`;

  const [scopeId, setScopeId] = useState<number | null>(initialScopeId);
  const [directory, setDirectory] = useState<TenantLocationDirectoryResponse | null>(
    initialLocationDirectory
  );
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(
    typeof initialLocationKey === "number" ? initialLocationKey : null
  );
  const [isCreateMode, setIsCreateMode] = useState(initialLocationKey === "new");
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [parentLocationId, setParentLocationId] = useState<number | null>(null);
  const [baseline, setBaseline] = useState({
    name: "",
    displayName: "",
    parentLocationId: null as number | null
  });
  const [fieldError, setFieldError] = useState<{
    name?: string;
    displayName?: string;
  }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [isDeletePending, setIsDeletePending] = useState(false);
  const [treeSearch, setTreeSearch] = useState("");
  const [parentSearch, setParentSearch] = useState("");
  const [expandedIdSet, setExpandedIdSet] = useState<Set<number>>(new Set());
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [draggedLocationId, setDraggedLocationId] = useState<number | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);
  const didInitRef = useRef(false);

  useEffect(() => {
    setPortalTarget(document.getElementById("app-shell-footer-slot"));
  }, []);

  const itemList = directory?.item_list ?? [];
  const itemMap = useMemo(() => new Map(itemList.map((item) => [item.id, item])), [itemList]);
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

  const selectedLocation = useMemo(() => {
    if (isCreateMode) {
      return null;
    }
    return itemList.find((item) => item.id === selectedLocationId) ?? itemList[0] ?? null;
  }, [isCreateMode, itemList, selectedLocationId]);

  const selectedLocationKey: SelectedLocationKey = isCreateMode
    ? "new"
    : (selectedLocation?.id ?? null);

  useEffect(() => {
    const currentPath = buildPath(
      locationPath,
      tab,
      parseScopeId(searchParams.get("scope")),
      parseLocationKey(searchParams.get("location"))
    );
    const nextPath = buildPath(locationPath, tab, scopeId, selectedLocationKey);
    if (currentPath !== nextPath) {
      router.replace(nextPath);
    }
  }, [locationPath, router, scopeId, searchParams, selectedLocationKey, tab]);

  useEffect(() => {
    if (!directory) {
      return;
    }
    setExpandedIdSet(
      new Set(
        directory.item_list
          .filter((item) => item.children_count > 0)
          .map((item) => item.id)
      )
    );
  }, [directory]);

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
      setFormError(null);
      setSuccessMessage(null);
      setIsDeletePending(false);
    },
    []
  );

  useEffect(() => {
    if (didInitRef.current || !directory) {
      return;
    }
    didInitRef.current = true;
    if (initialLocationKey === "new") {
      syncEditor(null, true, null);
      return;
    }
    const nextSelected =
      typeof initialLocationKey === "number"
        ? itemList.find((item) => item.id === initialLocationKey) ?? itemList[0] ?? null
        : itemList[0] ?? null;
    syncEditor(nextSelected, false, null);
  }, [directory, initialLocationKey, itemList, syncEditor]);

  const loadDirectory = useCallback(
    async (nextScopeId: number, preferredLocationId: SelectedLocationKey = null) => {
      const response = await fetch(`/api/auth/tenant/current/scopes/${nextScopeId}/locations`);
      const data: unknown = await response.json().catch(() => ({}));
      if (!response.ok) {
        setFormError(parseErrorDetail(data, copy.loadError));
        return;
      }
      const nextDirectory = data as TenantLocationDirectoryResponse;
      setDirectory(nextDirectory);
      if (preferredLocationId === "new") {
        syncEditor(null, true, null);
        return;
      }
      const nextSelected =
        typeof preferredLocationId === "number"
          ? nextDirectory.item_list.find((item) => item.id === preferredLocationId) ??
            nextDirectory.item_list[0] ??
            null
          : nextDirectory.item_list[0] ?? null;
      syncEditor(nextSelected, false, null);
    },
    [copy.loadError, syncEditor]
  );

  const deferredTreeSearch = useDeferredValue(treeSearch);
  const visibleItemList = useMemo(() => {
    const query = deferredTreeSearch.trim().toLowerCase();
    const includeIdSet = new Set<number>();
    const result: TenantLocationRecord[] = [];

    if (query) {
      for (const item of itemList) {
        const haystack =
          `${item.name} ${item.display_name} ${item.path_labels.join(" / ")}`.toLowerCase();
        if (!haystack.includes(query)) {
          continue;
        }
        includeIdSet.add(item.id);
        let parentId = item.parent_location_id ?? null;
        while (parentId != null) {
          includeIdSet.add(parentId);
          parentId = itemMap.get(parentId)?.parent_location_id ?? null;
        }
      }
    }

    const visit = (parentId: number | null) => {
      for (const item of childrenByParent.get(parentId) ?? []) {
        if (query && !includeIdSet.has(item.id)) {
          continue;
        }
        result.push(item);
        if ((query || expandedIdSet.has(item.id)) && item.children_count > 0) {
          visit(item.id);
        }
      }
    };

    visit(null);
    return result;
  }, [childrenByParent, deferredTreeSearch, expandedIdSet, itemList, itemMap]);

  const deferredParentSearch = useDeferredValue(parentSearch);
  const parentCandidateList = useMemo(() => {
    const query = deferredParentSearch.trim().toLowerCase();
    const blockedIdSet = new Set<number>();

    if (selectedLocation && !isCreateMode) {
      const visit = (locationId: number) => {
        blockedIdSet.add(locationId);
        for (const child of childrenByParent.get(locationId) ?? []) {
          visit(child.id);
        }
      };
      visit(selectedLocation.id);
    }

    return itemList.filter((item) => {
      if (blockedIdSet.has(item.id)) {
        return false;
      }
      if (!query) {
        return true;
      }
      return `${item.name} ${item.display_name} ${item.path_labels.join(" / ")}`
        .toLowerCase()
        .includes(query);
    });
  }, [childrenByParent, deferredParentSearch, isCreateMode, itemList, selectedLocation]);

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
      ? (selectedLocation?.can_delete ?? false)
      : (selectedLocation?.can_edit ?? false);

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

  const moveLocation = useCallback(
    async (locationId: number, nextParentId: number | null, targetIndex: number) => {
      if (scopeId == null) {
        return;
      }
      setFormError(null);
      setSuccessMessage(null);
      setIsMoving(true);
      const response = await fetch(
        `/api/auth/tenant/current/scopes/${scopeId}/locations/${locationId}/move`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            parent_location_id: nextParentId,
            target_index: targetIndex
          })
        }
      );
      const data: unknown = await response.json().catch(() => ({}));
      setIsMoving(false);
      setDraggedLocationId(null);
      setDropKey(null);
      if (!response.ok) {
        setFormError(parseErrorDetail(data, copy.moveError));
        return;
      }
      const nextDirectory = data as TenantLocationDirectoryResponse;
      setDirectory(nextDirectory);
      const nextSelected =
        nextDirectory.item_list.find((item) => item.id === locationId) ?? null;
      syncEditor(nextSelected, false, null);
      setSuccessMessage(copy.movedNotice);
    },
    [copy.moveError, copy.movedNotice, scopeId, syncEditor]
  );

  const handleStartCreate = useCallback(
    (draftParentId: number | null) => {
      if (!(directory?.can_create ?? false)) {
        return;
      }
      if (isDirty && !window.confirm(copy.discardConfirm)) {
        return;
      }
      syncEditor(null, true, draftParentId);
    },
    [copy.discardConfirm, directory?.can_create, isDirty, syncEditor]
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
    setFormError(null);
    setSuccessMessage(null);
    if (!isDeletePending && !validate()) {
      return;
    }

    setIsSaving(true);
    const endpoint = isCreateMode
      ? `/api/auth/tenant/current/scopes/${scopeId}/locations`
      : `/api/auth/tenant/current/scopes/${scopeId}/locations/${selectedLocation?.id}`;
    const previousLocationIdSet = new Set(directory.item_list.map((item) => item.id));
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
      setFormError(
        parseErrorDetail(
          data,
          isDeletePending ? copy.deleteError : isCreateMode ? copy.createError : copy.saveError
        )
      );
      return;
    }

    const nextDirectory = data as TenantLocationDirectoryResponse;
    setDirectory(nextDirectory);

    if (isDeletePending) {
      syncEditor(
        nextDirectory.item_list[0] ?? null,
        nextDirectory.item_list.length === 0 && nextDirectory.can_create,
        null
      );
      setSuccessMessage(copy.deletedNotice);
      return;
    }

    if (isCreateMode) {
      const created =
        nextDirectory.item_list.find((item) => !previousLocationIdSet.has(item.id)) ??
        nextDirectory.item_list[0] ??
        null;
      syncEditor(created, false, null);
      setSuccessMessage(copy.createdNotice);
      return;
    }

    const updated =
      nextDirectory.item_list.find((item) => item.id === selectedLocation?.id) ?? null;
    syncEditor(updated, false, null);
    setSuccessMessage(copy.savedNotice);
  }, [
    copy.createError,
    copy.createdNotice,
    copy.deleteError,
    copy.deletedNotice,
    copy.saveError,
    copy.savedNotice,
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

  const currentSiblingList = selectedLocation
    ? (childrenByParent.get(selectedLocation.parent_location_id ?? null) ?? [])
    : [];
  const currentSiblingIndex = selectedLocation
    ? currentSiblingList.findIndex((item) => item.id === selectedLocation.id)
    : -1;
  const pageTitle = isCreateMode
    ? copy.newLocationTitle
    : selectedLocation?.name ?? copy.title;

  return (
    <section className={`flex flex-col gap-6 ${tab === "general" ? "pb-56 lg:pb-0" : ""}`}>
      <PageHeader
        eyebrow={copy.eyebrow}
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

      <div className="ui-panel flex flex-wrap gap-1 p-1.5" role="tablist" aria-label={copy.tabListAriaLabel}>
        <button type="button" className={`ui-tab px-4 py-2.5 text-sm font-semibold ${tab === "general" ? "ui-tab-active" : ""}`} onClick={() => router.replace(buildPath(locationPath, "general", scopeId, selectedLocationKey))}>{copy.tabGeneral}</button>
        <button type="button" className={`ui-tab px-4 py-2.5 text-sm font-semibold ${tab === "history" ? "ui-tab-active" : ""}`} onClick={() => router.replace(buildPath(locationPath, "history", scopeId, selectedLocationKey))}>{copy.tabHistory}</button>
      </div>

      {tab === "general" ? (
        <div className="grid gap-6 2xl:grid-cols-[minmax(18rem,0.84fr)_minmax(0,1.16fr)_minmax(18rem,0.84fr)]">
          <aside className="ui-panel flex flex-col gap-4 px-5 py-5">
            <div className="flex items-start gap-4">
              <span className="ui-icon-badge"><WorkflowIcon className="h-[1.05rem] w-[1.05rem]" /></span>
              <div>
                <h2 className="text-base font-semibold tracking-[-0.02em] text-[var(--color-text)]">{copy.listTitle}</h2>
                <p className="mt-1 text-sm leading-6 text-[var(--color-text-subtle)]">{copy.listDescription}</p>
              </div>
            </div>

            <div className="grid gap-2">
              {initialScopeDirectory.item_list.map((scope) => (
                <button key={scope.id} type="button" className={`rounded-[var(--radius-card)] border px-4 py-3 text-left ${scope.id === scopeId ? "border-[rgba(37,117,216,0.24)] bg-[var(--color-accent-soft)]/65" : "border-[var(--color-border)] bg-white/75"}`} onClick={() => { if (scope.id === scopeId) { return; } if (isDirty && !window.confirm(copy.discardConfirm)) { return; } setScopeId(scope.id); void loadDirectory(scope.id); }}>
                  <p className="text-sm font-semibold text-[var(--color-text)]">{scope.name}</p>
                  <p className="mt-1 text-xs text-[var(--color-text-subtle)]">{scope.display_name}</p>
                </button>
              ))}
            </div>

            {scopeId == null ? <div className="ui-panel px-4 py-4 text-sm text-[var(--color-text-muted)]">{copy.emptyScope}</div> : null}
            {directory && !directory.can_edit ? <div className="ui-notice-attention px-4 py-3 text-sm">{copy.readOnlyNotice}</div> : null}

            <input className="ui-input w-full" value={treeSearch} onChange={(event) => setTreeSearch(event.target.value)} placeholder={copy.treeSearchPlaceholder} disabled={!directory} />
            <button type="button" className="ui-button-secondary" onClick={() => handleStartCreate(null)} disabled={!directory?.can_create}>{copy.newRoot}</button>

            <div className="grid gap-1">
              {visibleItemList.map((item) => {
                const siblings = childrenByParent.get(item.parent_location_id ?? null) ?? [];
                const siblingIndex = siblings.findIndex((sibling) => sibling.id === item.id);
                const topKey = `before-${item.id}`;
                const insideKey = `inside-${item.id}`;
                const bottomKey = `after-${item.id}`;
                const isSelected = item.id === selectedLocation?.id && !isCreateMode;

                return (
                  <div key={item.id} className="grid gap-1">
                    <div className={`h-2 rounded-full ${dropKey === topKey ? "bg-[var(--color-accent)]/70" : "bg-transparent"}`} onDragOver={(event) => { if (!draggedLocationId || draggedLocationId === item.id) { return; } event.preventDefault(); setDropKey(topKey); }} onDrop={(event) => { event.preventDefault(); if (!draggedLocationId || draggedLocationId === item.id) { return; } void moveLocation(draggedLocationId, item.parent_location_id ?? null, siblingIndex); }} />
                    <div className="flex items-stretch gap-2">
                      <div className={`flex flex-1 items-stretch gap-3 rounded-[var(--radius-card)] border px-4 py-3 ${dropKey === insideKey ? "border-[rgba(37,117,216,0.38)] bg-[var(--color-accent-soft)]/75" : isSelected ? "border-[rgba(37,117,216,0.24)] bg-[var(--color-accent-soft)]/65" : "border-[var(--color-border)] bg-white/75"}`} onDragOver={(event) => { if (!draggedLocationId || draggedLocationId === item.id) { return; } event.preventDefault(); setDropKey(insideKey); }} onDrop={(event) => { event.preventDefault(); if (!draggedLocationId || draggedLocationId === item.id) { return; } void moveLocation(draggedLocationId, item.id, item.children_count); }}>
                        {item.children_count > 0 ? (
                          <button type="button" className="mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] text-[11px]" onClick={() => setExpandedIdSet((previous) => { const next = new Set(previous); if (next.has(item.id)) { next.delete(item.id); } else { next.add(item.id); } return next; })}>
                            {expandedIdSet.has(item.id) ? "-" : "+"}
                          </button>
                        ) : <span className="mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center text-[11px]">•</span>}
                        <button type="button" className="flex-1 text-left" onClick={() => handleSelectLocation(item)} style={{ paddingLeft: `${item.depth * 1.1}rem` }}>
                          <p className="text-sm font-semibold text-[var(--color-text)]">{resolveLocationLabel(item)}</p>
                          <p className="mt-1 text-xs text-[var(--color-text-subtle)]">{item.display_name}</p>
                        </button>
                      </div>
                      <button type="button" className="rounded-[var(--radius-card)] border px-3 text-sm font-semibold" draggable={item.can_move && !isSaving && !isMoving} onDragStart={(event: DragEvent<HTMLButtonElement>) => { setDraggedLocationId(item.id); event.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => { setDraggedLocationId(null); setDropKey(null); }} disabled={!item.can_move || isSaving || isMoving}>:::</button>
                    </div>
                    <div className={`h-2 rounded-full ${dropKey === bottomKey ? "bg-[var(--color-accent)]/70" : "bg-transparent"}`} onDragOver={(event) => { if (!draggedLocationId || draggedLocationId === item.id) { return; } event.preventDefault(); setDropKey(bottomKey); }} onDrop={(event) => { event.preventDefault(); if (!draggedLocationId || draggedLocationId === item.id) { return; } void moveLocation(draggedLocationId, item.parent_location_id ?? null, siblingIndex + 1); }} />
                  </div>
                );
              })}

              {directory && visibleItemList.length === 0 ? <div className="ui-panel px-4 py-4 text-sm text-[var(--color-text-muted)]">{itemList.length === 0 ? copy.empty : copy.noParentCandidates}</div> : null}
            </div>
          </aside>
          <div className={`ui-panel flex flex-col gap-6 px-6 py-6 ${isDeletePending ? "ui-delete-pending" : ""}`}>
            {successMessage ? <div className="ui-tone-positive rounded-[var(--radius-card)] border px-4 py-3 text-sm">{successMessage}</div> : null}
            {formError ? <div className="ui-notice-danger px-4 py-3 text-sm">{formError}</div> : null}

            <section className="ui-card px-5 py-5">
              <div className="flex items-start gap-4">
                <span className="ui-icon-badge"><PreviewIcon className="h-[1.05rem] w-[1.05rem]" /></span>
                <div>
                  <h2 className="text-base font-semibold tracking-[-0.02em] text-[var(--color-text)]">{copy.sectionIdentityTitle}</h2>
                  <p className="mt-1 text-sm leading-6 text-[var(--color-text-subtle)]">{copy.sectionIdentityDescription}</p>
                </div>
              </div>

              <div className="mt-5 grid gap-5">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-[var(--color-text-muted)]" htmlFor="location-name">{copy.nameLabel}</label>
                  <input id="location-name" className="ui-input w-full" value={name} onChange={(event) => { setName(event.target.value); setFieldError((previous) => ({ ...previous, name: undefined })); setSuccessMessage(null); }} disabled={isDeletePending || !canEditForm} aria-invalid={Boolean(fieldError.name)} />
                  <p className="text-xs leading-5 text-[var(--color-text-subtle)]">{copy.nameHint}</p>
                  {fieldError.name ? <p className="text-sm text-[var(--color-danger-text)]">{fieldError.name}</p> : null}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-[var(--color-text-muted)]" htmlFor="location-display-name">{copy.displayNameLabel}</label>
                  <textarea id="location-display-name" className="ui-input min-h-28 w-full resize-y" value={displayName} onChange={(event) => { setDisplayName(event.target.value); setFieldError((previous) => ({ ...previous, displayName: undefined })); setSuccessMessage(null); }} disabled={isDeletePending || !canEditForm} aria-invalid={Boolean(fieldError.displayName)} />
                  <p className="text-xs leading-5 text-[var(--color-text-subtle)]">{copy.displayNameHint}</p>
                  {fieldError.displayName ? <p className="text-sm text-[var(--color-danger-text)]">{fieldError.displayName}</p> : null}
                </div>
              </div>
            </section>

            <section className="ui-card px-5 py-5">
              <div className="flex items-start gap-4">
                <span className="ui-icon-badge"><ScopeIcon className="h-[1.05rem] w-[1.05rem]" /></span>
                <div>
                  <h2 className="text-base font-semibold tracking-[-0.02em] text-[var(--color-text)]">{copy.sectionStructureTitle}</h2>
                  <p className="mt-1 text-sm leading-6 text-[var(--color-text-subtle)]">{copy.sectionStructureDescription}</p>
                </div>
              </div>

              <div className="mt-5 space-y-2">
                <label className="text-sm font-semibold text-[var(--color-text-muted)]" htmlFor="location-parent-search">{copy.parentSearchLabel}</label>
                <input id="location-parent-search" className="ui-input w-full" value={parentSearch} onChange={(event) => setParentSearch(event.target.value)} placeholder={copy.parentSearchPlaceholder} disabled={!canEditForm || isDeletePending} />
                <p className="text-xs leading-5 text-[var(--color-text-subtle)]">{copy.parentHint}</p>
              </div>

              <div className="mt-4 max-h-72 overflow-auto rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-background-muted)]/55 p-2">
                <button type="button" className={`mb-2 flex w-full rounded-[var(--radius-card)] border px-3 py-3 text-left ${parentLocationId == null ? "border-[rgba(37,117,216,0.24)] bg-[var(--color-accent-soft)]/65" : "border-[var(--color-border)] bg-white/78"}`} onClick={() => setParentLocationId(null)} disabled={!canEditForm || isDeletePending}>{copy.rootOptionLabel}</button>
                {parentCandidateList.map((candidate) => (
                  <button key={candidate.id} type="button" className={`mb-2 flex w-full flex-col rounded-[var(--radius-card)] border px-3 py-3 text-left ${parentLocationId === candidate.id ? "border-[rgba(37,117,216,0.24)] bg-[var(--color-accent-soft)]/65" : "border-[var(--color-border)] bg-white/78"}`} onClick={() => setParentLocationId(candidate.id)} disabled={!canEditForm || isDeletePending}>
                    <span className="text-sm font-semibold text-[var(--color-text)]">{resolveLocationLabel(candidate)}</span>
                    <span className="mt-1 text-xs leading-5 text-[var(--color-text-subtle)]">{candidate.path_labels.join(" / ")}</span>
                  </button>
                ))}
                {parentCandidateList.length === 0 ? <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-border)] px-3 py-3 text-sm text-[var(--color-text-muted)]">{copy.noParentCandidates}</div> : null}
              </div>
            </section>
          </div>

          <aside className="flex flex-col gap-4">
            <div className="ui-panel p-5">
              <div className="flex items-start gap-4">
                <span className="ui-icon-badge"><PreviewIcon className="h-[1.05rem] w-[1.05rem]" /></span>
                <div>
                  <h2 className="text-base font-semibold tracking-[-0.02em] text-[var(--color-text)]">{copy.reorderTitle}</h2>
                  <p className="mt-1 text-sm leading-6 text-[var(--color-text-subtle)]">{copy.reorderDescription}</p>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <button type="button" className="ui-button-secondary" onClick={() => selectedLocation && currentSiblingIndex > 0 ? void moveLocation(selectedLocation.id, selectedLocation.parent_location_id ?? null, currentSiblingIndex - 1) : undefined} disabled={!selectedLocation || currentSiblingIndex < 1 || isMoving}>{copy.moveUp}</button>
                <button type="button" className="ui-button-secondary" onClick={() => selectedLocation && currentSiblingIndex >= 0 ? void moveLocation(selectedLocation.id, selectedLocation.parent_location_id ?? null, currentSiblingIndex + 1) : undefined} disabled={!selectedLocation || currentSiblingIndex < 0 || currentSiblingIndex >= currentSiblingList.length - 1 || isMoving}>{copy.moveDown}</button>
                <button type="button" className="ui-button-secondary" onClick={() => selectedLocation ? handleStartCreate(selectedLocation.id) : undefined} disabled={!selectedLocation || !directory?.can_create}>{copy.newChild}</button>
                <button type="button" className="ui-button-secondary" onClick={() => handleStartCreate(selectedLocation?.parent_location_id ?? null)} disabled={!selectedLocation || !directory?.can_create}>{copy.newSibling}</button>
              </div>
              <p className="mt-4 text-xs leading-5 text-[var(--color-text-subtle)]">{copy.dragDropHint}</p>
              {selectedLocation && selectedLocation.children_count > 0 ? <p className="mt-3 text-sm text-[var(--color-text-muted)]">{copy.childDeleteBlocked}</p> : null}
            </div>

            {selectedLocation && !isCreateMode ? (
              <div className="ui-panel p-5">
                <div className="grid gap-3">
                  <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white/75 px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-subtle)]">{copy.metadataIdLabel}</p>
                    <p className="mt-2 text-sm font-semibold text-[var(--color-text)]">{selectedLocation.id}</p>
                  </div>
                  <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white/75 px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-subtle)]">{copy.metadataPathLabel}</p>
                    <p className="mt-2 text-sm text-[var(--color-text)]">{selectedLocation.path_labels.join(" / ")}</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white/75 px-4 py-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-subtle)]">{copy.metadataChildrenLabel}</p>
                      <p className="mt-2 text-sm font-semibold text-[var(--color-text)]">{selectedLocation.children_count}</p>
                    </div>
                    <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white/75 px-4 py-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-subtle)]">{copy.metadataDescendantsLabel}</p>
                      <p className="mt-2 text-sm font-semibold text-[var(--color-text)]">{selectedLocation.descendants_count}</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="ui-card ui-card-coming-soon p-5">
              <div className="flex items-start gap-4">
                <span className="ui-icon-badge ui-icon-badge-construction"><HistoryIcon className="h-[1.05rem] w-[1.05rem]" /></span>
                <div>
                  <h2 className="text-base font-semibold tracking-[-0.02em] text-[var(--color-text)]">{copy.historyTitle}</h2>
                  <p className="mt-1 text-sm leading-6 text-[var(--color-text-subtle)]">{copy.historyDescription}</p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      ) : (
        <div className="ui-panel px-6 py-6 text-sm text-[var(--color-text-muted)]">{copy.historyDescription}</div>
      )}

      {tab === "general" && portalTarget
        ? createPortal(
            <div className="mx-auto flex w-full max-w-[112rem] flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5 lg:px-8">
              <Link href={configurationPath} className="ui-button-secondary inline-flex items-center justify-center" onClick={(event: MouseEvent<HTMLAnchorElement>) => { if (isDirty && !window.confirm(copy.discardConfirm)) { event.preventDefault(); } }}>{copy.cancel}</Link>
              <div className="flex gap-2">
                {!isCreateMode && selectedLocation ? (
                  <button type="button" className="ui-button-danger" onClick={() => setIsDeletePending((previous) => !previous)} disabled={!selectedLocation.can_delete || isSaving}>{isDeletePending ? copy.undoDelete : copy.delete}</button>
                ) : null}
                <button type="button" className="ui-button-primary" onClick={() => void handleSave()} disabled={!directory || !canSubmit || isSaving || !isDirty}>{isSaving ? copy.saving : copy.save}</button>
              </div>
            </div>,
            portalTarget
          )
        : null}
    </section>
  );
}
