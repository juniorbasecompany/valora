"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  directoryEditorCanSubmitForDirectoryEditor,
  directoryEditorSaveDisabled
} from "@/component/configuration/configuration-directory-editor-policy";
import { ConfigurationDirectoryEditorShell } from "@/component/configuration/configuration-directory-editor-shell";
import { ConfigurationInfoSection } from "@/component/configuration/configuration-info-section";
import { ConfigurationDirectoryCreateButton } from "@/component/configuration/configuration-directory-create-button";
import { EventFilterPanel } from "@/component/configuration/event-filter-panel";
import { TrashIconButton } from "@/component/ui/trash-icon-button";
import { TenantDateTimePicker } from "@/component/ui/tenant-date-time-picker";
import { EditorPanelFlashOverlay } from "@/component/configuration/editor-panel-flash-overlay";
import { useEditorPanelFlash } from "@/component/configuration/use-editor-panel-flash";
import { useFocusFirstEditorFieldAfterFlash } from "@/component/configuration/use-focus-first-editor-field-after-flash";
import { useReplaceConfigurationPath } from "@/component/configuration/use-replace-configuration-path";
import type {
  TenantLocationDirectoryResponse,
  TenantScopeActionDirectoryResponse,
  TenantScopeEventDirectoryResponse,
  TenantScopeEventRecord,
  TenantScopeRecord,
  TenantUnityDirectoryResponse
} from "@/lib/auth/types";
import { parseErrorDetail } from "@/lib/api/parse-error-detail";

export type EventConfigurationCopy = {
  title: string;
  description: string;
  empty: string;
  emptyScope: string;
  missingCurrentScope: string;
  loadError: string;
  historyTitle: string;
  historyDescription: string;
  momentLabel: string;
  momentHint: string;
  locationLabel: string;
  locationHint: string;
  unityLabel: string;
  unityHint: string;
  actionLabel: string;
  actionHint: string;
  filterTitle: string;
  filterMomentFromLabel: string;
  filterMomentToLabel: string;
  filterLocationLabel: string;
  filterUnityLabel: string;
  filterActionLabel: string;
  filterAll: string;
  filterAllAria: string;
  filterConfirm: string;
  sectionInfoTitle: string;
  sectionInfoDescription: string;
  infoSummaryLabel: string;
  infoCreateLead: string;
  infoCreateHint: string;
  fallbackLocation: string;
  fallbackUnity: string;
  fallbackAction: string;
  fallbackEvent: string;
  cancel: string;
  directoryCreateLabel: string;
  delete: string;
  undoDelete: string;
  save: string;
  saving: string;
  readOnlyNotice: string;
  saveError: string;
  createError: string;
  deleteError: string;
  deleteBlockedDetail: string;
  momentRequired: string;
  locationRequired: string;
  unityRequired: string;
  actionRequired: string;
  discardConfirm: string;
};

type EventConfigurationClientProps = {
  locale: string;
  currentScope: TenantScopeRecord | null;
  hasAnyScope: boolean;
  initialEventDirectory: TenantScopeEventDirectoryResponse | null;
  initialLocationDirectory: TenantLocationDirectoryResponse | null;
  initialUnityDirectory: TenantUnityDirectoryResponse | null;
  initialActionDirectory: TenantScopeActionDirectoryResponse | null;
  copy: EventConfigurationCopy;
};

type EventSelectionKey = number | "new" | null;

function parseSelectedEventKey(raw: string | null): EventSelectionKey {
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

function resolveSelectedEventKey(
  itemList: TenantScopeEventRecord[],
  preferredKey: EventSelectionKey,
  canCreate: boolean
): EventSelectionKey {
  if (preferredKey === "new") {
    return canCreate ? "new" : null;
  }

  if (typeof preferredKey === "number") {
    const found = itemList.find((item) => item.id === preferredKey)?.id;
    if (found != null) {
      return found;
    }
    return canCreate ? "new" : null;
  }

  return canCreate ? "new" : null;
}

function normalizeUtcMomentInput(value: string): string {
  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(value)) {
    return value;
  }
  return `${value}Z`;
}

function parseUtcMoment(value: string): Date | null {
  const parsed = new Date(normalizeUtcMomentInput(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function toLocalMomentInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  const hour = pad2(date.getHours());
  const minute = pad2(date.getMinutes());
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function toLocalMomentInputFromUtc(value: string): string {
  const parsed = parseUtcMoment(value);
  if (!parsed) {
    return "";
  }
  return toLocalMomentInputValue(parsed);
}

function toUtcIsoFromLocalInput(value: string): string | null {
  if (!value.trim()) {
    return null;
  }
  const localMoment = new Date(value);
  if (Number.isNaN(localMoment.getTime())) {
    return null;
  }
  return localMoment.toISOString();
}

function formatMomentCompact(value: string): string {
  const parsed = parseUtcMoment(value);
  if (!parsed) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(parsed);
}

function nowLocalMomentInput(): string {
  return toLocalMomentInputValue(new Date());
}

function parseNumericFilter(value: string): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return null;
  }
  return parsed;
}

function isDeleteBlockedDetail(detail: string | null): boolean {
  if (!detail) {
    return false;
  }
  const normalized = detail.toLowerCase();
  return (
    normalized.includes("results reference") ||
    normalized.includes("results referenc")
  );
}

export function EventConfigurationClient({
  locale,
  currentScope,
  hasAnyScope,
  initialEventDirectory,
  initialLocationDirectory,
  initialUnityDirectory,
  initialActionDirectory,
  copy
}: EventConfigurationClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSearchEventKey = parseSelectedEventKey(searchParams.get("event"));

  const configurationPath = `/${locale}/app/configuration`;
  const eventPath = `/${locale}/app/configuration/event`;

  const replacePath = useCallback(
    (nextPath: string) => {
      router.replace(nextPath, { scroll: false });
    },
    [router]
  );

  const locationMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const item of initialLocationDirectory?.item_list ?? []) {
      const label = item.path_labels.length > 0
        ? item.path_labels.join(" / ")
        : item.name.trim() || item.display_name.trim() || `#${item.id}`;
      map.set(item.id, label);
    }
    return map;
  }, [initialLocationDirectory?.item_list]);

  const unityMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const item of initialUnityDirectory?.item_list ?? []) {
      const label = item.path_labels.length > 0
        ? item.path_labels.join(" / ")
        : item.name.trim() || item.display_name.trim() || `#${item.id}`;
      map.set(item.id, label);
    }
    return map;
  }, [initialUnityDirectory?.item_list]);

  const actionMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const item of initialActionDirectory?.item_list ?? []) {
      map.set(item.id, item.label_name?.trim() || `#${item.id}`);
    }
    return map;
  }, [initialActionDirectory?.item_list]);

  const locationOptionList = useMemo(
    () =>
      (initialLocationDirectory?.item_list ?? []).map((item) => ({
        id: item.id,
        label:
          item.path_labels.length > 0
            ? item.path_labels.join(" / ")
            : item.name.trim() || item.display_name.trim() || `#${item.id}`
      })),
    [initialLocationDirectory?.item_list]
  );

  const unityOptionList = useMemo(
    () =>
      (initialUnityDirectory?.item_list ?? []).map((item) => ({
        id: item.id,
        label:
          item.path_labels.length > 0
            ? item.path_labels.join(" / ")
            : item.name.trim() || item.display_name.trim() || `#${item.id}`
      })),
    [initialUnityDirectory?.item_list]
  );

  const actionOptionList = useMemo(
    () =>
      (initialActionDirectory?.item_list ?? []).map((item) => ({
        id: item.id,
        label: item.label_name?.trim() || `#${item.id}`
      })),
    [initialActionDirectory?.item_list]
  );

  const [directory, setDirectory] = useState<TenantScopeEventDirectoryResponse | null>(
    initialEventDirectory
  );
  const [isLoadingDirectory, setIsLoadingDirectory] = useState(false);

  const initialSelectedEventKey =
    initialEventDirectory != null
      ? resolveSelectedEventKey(
        initialEventDirectory.item_list,
        initialSearchEventKey,
        initialEventDirectory.can_edit
      )
      : null;
  const initialSelectedEvent =
    typeof initialSelectedEventKey === "number" && initialEventDirectory
      ? initialEventDirectory.item_list.find((item) => item.id === initialSelectedEventKey) ?? null
      : null;

  const [selectedEventId, setSelectedEventId] = useState<number | null>(
    typeof initialSelectedEventKey === "number" ? initialSelectedEventKey : null
  );
  const [isCreateMode, setIsCreateMode] = useState(initialSelectedEventKey === "new");
  const [momentInput, setMomentInput] = useState(
    initialSelectedEvent
      ? toLocalMomentInputFromUtc(initialSelectedEvent.moment_utc)
      : nowLocalMomentInput()
  );
  const [locationId, setLocationId] = useState<number | null>(
    initialSelectedEvent?.location_id ?? null
  );
  const [unityId, setUnityId] = useState<number | null>(
    initialSelectedEvent?.unity_id ?? null
  );
  const [actionId, setActionId] = useState<number | null>(
    initialSelectedEvent?.action_id ?? null
  );
  const [baseline, setBaseline] = useState({
    momentInput: initialSelectedEvent
      ? toLocalMomentInputFromUtc(initialSelectedEvent.moment_utc)
      : nowLocalMomentInput(),
    locationId: initialSelectedEvent?.location_id ?? null,
    unityId: initialSelectedEvent?.unity_id ?? null,
    actionId: initialSelectedEvent?.action_id ?? null
  });
  const [fieldError, setFieldError] = useState<{
    moment?: string;
    location?: string;
    unity?: string;
    action?: string;
  }>({});
  const [requestErrorMessage, setRequestErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeletePending, setIsDeletePending] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [filterMomentFromInput, setFilterMomentFromInput] = useState("");
  const [filterMomentToInput, setFilterMomentToInput] = useState("");
  const [filterLocationIdList, setFilterLocationIdList] = useState<number[]>([]);
  const [filterUnityIdList, setFilterUnityIdList] = useState<number[]>([]);
  const [filterActionId, setFilterActionId] = useState<number | null>(null);
  const editorPanelElementRef = useRef<HTMLDivElement | null>(null);
  const initialSearchEventKeyRef = useRef<EventSelectionKey>(initialSearchEventKey);
  const selectedEventKeyRef = useRef<EventSelectionKey>(initialSelectedEventKey);
  const didResolveInitialUrlRef = useRef(false);
  const didMountFilterRef = useRef(false);

  const selectedEvent = useMemo(() => {
    if (isCreateMode) {
      return null;
    }

    return (
      selectedEventId == null
        ? null
        : (directory?.item_list.find((item) => item.id === selectedEventId) ?? null)
    );
  }, [directory?.item_list, isCreateMode, selectedEventId]);

  const selectedEventKey: EventSelectionKey = isCreateMode ? "new" : selectedEvent?.id ?? null;

  useReplaceConfigurationPath(
    eventPath,
    searchParams,
    replacePath,
    "event",
    directory ? (isCreateMode ? "new" : selectedEvent?.id ?? null) : null
  );

  const editorFlashKey = useMemo(() => {
    if (!directory) {
      return null;
    }
    if (isCreateMode) {
      return "new";
    }
    if (!selectedEvent) {
      return null;
    }
    return `id:${String(selectedEvent.id)}:moment:${selectedEvent.moment_utc}`;
  }, [directory, isCreateMode, selectedEvent]);

  const isEditorFlashActive = useEditorPanelFlash(editorPanelElementRef, editorFlashKey);
  useFocusFirstEditorFieldAfterFlash(
    editorPanelElementRef,
    isEditorFlashActive,
    Boolean(directory)
  );

  useEffect(() => {
    selectedEventKeyRef.current = isCreateMode ? "new" : selectedEvent?.id ?? null;
  }, [isCreateMode, selectedEvent]);

  const syncFromDirectory = useCallback(
    (
      nextDirectory: TenantScopeEventDirectoryResponse | null,
      preferredKey?: EventSelectionKey
    ) => {
      if (!nextDirectory) {
        setDirectory(null);
        setIsCreateMode(false);
        setSelectedEventId(null);
        const nextMomentInput = nowLocalMomentInput();
        setMomentInput(nextMomentInput);
        setLocationId(null);
        setUnityId(null);
        setActionId(null);
        setBaseline({
          momentInput: nextMomentInput,
          locationId: null,
          unityId: null,
          actionId: null
        });
        setFieldError({});
        setRequestErrorMessage(null);
        setIsDeletePending(false);
        return null;
      }

      const nextKey = resolveSelectedEventKey(
        nextDirectory.item_list,
        preferredKey ?? null,
        nextDirectory.can_edit
      );
      const nextSelectedEvent =
        typeof nextKey === "number"
          ? nextDirectory.item_list.find((item) => item.id === nextKey) ?? null
          : null;

      const nextMomentInput = nextSelectedEvent
        ? toLocalMomentInputFromUtc(nextSelectedEvent.moment_utc)
        : nowLocalMomentInput();
      const nextLocationId = nextSelectedEvent?.location_id ?? null;
      const nextUnityId = nextSelectedEvent?.unity_id ?? null;
      const nextActionId = nextSelectedEvent?.action_id ?? null;

      setDirectory(nextDirectory);
      setIsCreateMode(nextKey === "new");
      setSelectedEventId(typeof nextKey === "number" ? nextKey : null);
      setMomentInput(nextMomentInput);
      setLocationId(nextLocationId);
      setUnityId(nextUnityId);
      setActionId(nextActionId);
      setBaseline({
        momentInput: nextMomentInput,
        locationId: nextLocationId,
        unityId: nextUnityId,
        actionId: nextActionId
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
      ? selectedEventKeyRef.current
      : initialSearchEventKeyRef.current;
    didResolveInitialUrlRef.current = true;
    syncFromDirectory(initialEventDirectory, preferredKey);
  }, [initialEventDirectory, syncFromDirectory]);

  const scopeId = currentScope?.id;

  const loadEventDirectory = useCallback(
    async (preferredKey?: EventSelectionKey) => {
      if (scopeId == null) {
        syncFromDirectory(null, null);
        return;
      }

      const query = new URLSearchParams();
      const filterMomentFromUtc = toUtcIsoFromLocalInput(filterMomentFromInput);
      const filterMomentToUtc = toUtcIsoFromLocalInput(filterMomentToInput);
      if (filterMomentFromUtc) {
        query.set("moment_from_utc", filterMomentFromUtc);
      }
      if (filterMomentToUtc) {
        query.set("moment_to_utc", filterMomentToUtc);
      }
      for (const locationId of filterLocationIdList) {
        query.append("location_id", String(locationId));
      }
      for (const unityId of filterUnityIdList) {
        query.append("unity_id", String(unityId));
      }
      if (filterActionId != null) {
        query.set("action_id", String(filterActionId));
      }

      setIsLoadingDirectory(true);
      try {
        const response = await fetch(
          `/api/auth/tenant/current/scopes/${scopeId}/events?${query.toString()}`
        );
        const data: unknown = await response.json().catch(() => ({}));
        if (!response.ok) {
          setRequestErrorMessage(parseErrorDetail(data, copy.loadError) ?? copy.loadError);
          return;
        }
        syncFromDirectory(
          data as TenantScopeEventDirectoryResponse,
          preferredKey ?? selectedEventKeyRef.current
        );
      } catch {
        setRequestErrorMessage(copy.loadError);
      } finally {
        setIsLoadingDirectory(false);
      }
    },
    [
      copy.loadError,
      filterActionId,
      filterLocationIdList,
      filterMomentFromInput,
      filterMomentToInput,
      filterUnityIdList,
      scopeId,
      syncFromDirectory
    ]
  );

  useEffect(() => {
    if (!didMountFilterRef.current) {
      didMountFilterRef.current = true;
      return;
    }
    void loadEventDirectory(selectedEventKeyRef.current);
  }, [loadEventDirectory]);

  const resolveLocationLabel = useCallback(
    (id: number | null) => (id == null ? "-" : (locationMap.get(id) ?? copy.fallbackLocation)),
    [copy.fallbackLocation, locationMap]
  );

  const resolveUnityLabel = useCallback(
    (id: number | null) => (id == null ? "-" : (unityMap.get(id) ?? copy.fallbackUnity)),
    [copy.fallbackUnity, unityMap]
  );

  const resolveActionLabel = useCallback(
    (id: number | null) => (id == null ? "-" : (actionMap.get(id) ?? copy.fallbackAction)),
    [actionMap, copy.fallbackAction]
  );

  const buildEventSummary = useCallback(
    (item: TenantScopeEventRecord) =>
      `${resolveActionLabel(item.action_id)} | ${resolveLocationLabel(item.location_id)} | ${resolveUnityLabel(item.unity_id)}`,
    [resolveActionLabel, resolveLocationLabel, resolveUnityLabel]
  );

  const isDirty = useMemo(
    () =>
      momentInput.trim() !== baseline.momentInput.trim() ||
      locationId !== baseline.locationId ||
      unityId !== baseline.unityId ||
      actionId !== baseline.actionId ||
      isDeletePending,
    [
      actionId,
      baseline.actionId,
      baseline.locationId,
      baseline.momentInput,
      baseline.unityId,
      isDeletePending,
      locationId,
      momentInput,
      unityId
    ]
  );

  const validate = useCallback(() => {
    const nextError: {
      moment?: string;
      location?: string;
      unity?: string;
      action?: string;
    } = {};

    if (!toUtcIsoFromLocalInput(momentInput)) {
      nextError.moment = copy.momentRequired;
    }
    if (locationId == null) {
      nextError.location = copy.locationRequired;
    }
    if (unityId == null) {
      nextError.unity = copy.unityRequired;
    }
    if (actionId == null) {
      nextError.action = copy.actionRequired;
    }

    setFieldError(nextError);
    return Object.keys(nextError).length === 0;
  }, [
    actionId,
    copy.actionRequired,
    copy.locationRequired,
    copy.momentRequired,
    copy.unityRequired,
    locationId,
    momentInput,
    unityId
  ]);

  const handleStartCreate = useCallback(() => {
    if (!directory?.can_edit || isSaving) {
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

  const handleSelectEvent = useCallback(
    (item: TenantScopeEventRecord) => {
      if (!directory) {
        return;
      }
      if (!isCreateMode && item.id === selectedEvent?.id) {
        return;
      }
      if (isDirty && !window.confirm(copy.discardConfirm)) {
        return;
      }
      syncFromDirectory(directory, item.id);
    },
    [copy.discardConfirm, directory, isCreateMode, isDirty, selectedEvent, syncFromDirectory]
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

    if (!directory || scopeId == null) {
      return;
    }
    if (!isDeletePending && !validate()) {
      return;
    }

    const momentUtc = toUtcIsoFromLocalInput(momentInput);
    if (!isDeletePending && !momentUtc) {
      setFieldError((previous) => ({ ...previous, moment: copy.momentRequired }));
      return;
    }

    setIsSaving(true);
    try {
      if (isCreateMode) {
        const response = await fetch(`/api/auth/tenant/current/scopes/${scopeId}/events`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            location_id: locationId,
            unity_id: unityId,
            action_id: actionId,
            moment_utc: momentUtc
          })
        });
        const data: unknown = await response.json().catch(() => ({}));

        if (!response.ok) {
          setRequestErrorMessage(parseErrorDetail(data, copy.createError) ?? copy.createError);
          return;
        }

        const updatedDirectory = data as TenantScopeEventDirectoryResponse;
        const previousIdSet = new Set(directory.item_list.map((item) => item.id));
        const created = updatedDirectory.item_list.find((item) => !previousIdSet.has(item.id));
        await loadEventDirectory(created?.id ?? "new");
        setHistoryRefreshKey((previous) => previous + 1);
        return;
      }

      if (!selectedEvent) {
        return;
      }

      const response = await fetch(
        `/api/auth/tenant/current/scopes/${scopeId}/events/${selectedEvent.id}`,
        isDeletePending
          ? { method: "DELETE" }
          : {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              location_id: locationId,
              unity_id: unityId,
              action_id: actionId,
              moment_utc: momentUtc
            })
          }
      );
      const data: unknown = await response.json().catch(() => ({}));

      if (!response.ok) {
        const fallback = isDeletePending ? copy.deleteError : copy.saveError;
        const detail = parseErrorDetail(data, fallback) ?? fallback;
        if (isDeletePending && isDeleteBlockedDetail(detail)) {
          setRequestErrorMessage(copy.deleteBlockedDetail);
          return;
        }
        setRequestErrorMessage(detail);
        return;
      }

      const nextKeyAfterMutation: EventSelectionKey = isDeletePending
        ? (directory.can_edit ? "new" : null)
        : selectedEvent.id;
      await loadEventDirectory(nextKeyAfterMutation);
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
    actionId,
    copy.createError,
    copy.deleteBlockedDetail,
    copy.deleteError,
    copy.momentRequired,
    copy.saveError,
    directory,
    isCreateMode,
    isDeletePending,
    loadEventDirectory,
    locationId,
    momentInput,
    scopeId,
    selectedEvent,
    unityId,
    validate
  ]);

  const canEditForm = Boolean(directory?.can_edit);
  const canSubmit = directoryEditorCanSubmitForDirectoryEditor({
    isCreateMode,
    isDeletePending,
    canCreate: directory?.can_edit ?? false,
    canEdit: directory?.can_edit ?? false
  });
  const footerErrorMessage =
    requestErrorMessage ??
    fieldError.moment ??
    fieldError.location ??
    fieldError.unity ??
    fieldError.action ??
    null;

  const asideEmptyMessage = !currentScope
    ? hasAnyScope
      ? copy.missingCurrentScope
      : copy.emptyScope
    : copy.loadError;

  return (
    <ConfigurationDirectoryEditorShell
      headerTitle={copy.title}
      headerDescription={copy.description}
      topContent={
        directory ? (
          <EventFilterPanel
            locale={locale}
            copy={{
              momentFromLabel: copy.filterMomentFromLabel,
              momentToLabel: copy.filterMomentToLabel,
              locationLabel: copy.filterLocationLabel,
              unityLabel: copy.filterUnityLabel,
              actionLabel: copy.filterActionLabel,
              allLabel: copy.filterAll,
              allAriaLabel: copy.filterAllAria,
              confirmLabel: copy.filterConfirm
            }}
            filterMomentFromInput={filterMomentFromInput}
            filterMomentToInput={filterMomentToInput}
            filterLocationIdList={filterLocationIdList}
            filterUnityIdList={filterUnityIdList}
            filterActionId={filterActionId}
            locationItemList={initialLocationDirectory?.item_list ?? []}
            unityItemList={initialUnityDirectory?.item_list ?? []}
            actionOptionList={actionOptionList}
            onFilterMomentFromChange={(value) => {
              setFilterMomentFromInput(value ? toLocalMomentInputValue(value) : "");
            }}
            onFilterMomentToChange={(value) => {
              setFilterMomentToInput(value ? toLocalMomentInputValue(value) : "");
            }}
            onFilterLocationChange={setFilterLocationIdList}
            onFilterUnityChange={setFilterUnityIdList}
            onFilterActionChange={(value) => {
              setFilterActionId(parseNumericFilter(value));
            }}
          />
        ) : null
      }
      editorPanelRef={editorPanelElementRef}
      isDeletePending={isDeletePending}
      directoryAside={
        <>
          {!directory ? (
            <div className="ui-panel ui-empty-panel">{asideEmptyMessage}</div>
          ) : null}

          {directory && !directory.can_edit ? (
            <div className="ui-notice-attention ui-notice-block">
              {copy.readOnlyNotice}
            </div>
          ) : null}

          <div className="ui-directory-list">
            {directory?.can_edit ? (
              <ConfigurationDirectoryCreateButton
                label={copy.directoryCreateLabel}
                active={isCreateMode}
                disabled={isSaving}
                onClick={handleStartCreate}
              />
            ) : null}

            {directory?.item_list.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectEvent(item)}
                className="ui-directory-item"
                data-selected={item.id === selectedEvent?.id ? "true" : undefined}
                data-delete-pending={
                  item.id === selectedEvent?.id && isDeletePending
                    ? "true"
                    : undefined
                }
              >
                <p className="ui-directory-title">{formatMomentCompact(item.moment_utc)}</p>
                <p className="ui-directory-caption-wrap">{buildEventSummary(item)}</p>
              </button>
            ))}

            {directory && directory.item_list.length === 0 && !isLoadingDirectory ? (
              <div className="ui-panel ui-empty-panel ui-panel-body-compact">
                {copy.empty}
              </div>
            ) : null}
          </div>
        </>
      }
      editorForm={
        directory ? (
          <>
            <section className="ui-card ui-form-section ui-border-accent">
              <EditorPanelFlashOverlay active={isEditorFlashActive} />
              <div className="ui-field">
                <label className="ui-field-label" htmlFor="event-moment">
                  {copy.momentLabel}
                </label>
                <TenantDateTimePicker
                  id="event-moment"
                  value={momentInput ? new Date(momentInput) : null}
                  onChange={(value) => {
                    setMomentInput(value ? toLocalMomentInputValue(value) : "");
                    setFieldError((previous) => ({ ...previous, moment: undefined }));
                    setRequestErrorMessage(null);
                  }}
                  disabled={isDeletePending || !canEditForm}
                  showFlash={Boolean(fieldError.moment)}
                  locale={locale}
                />
                <p className="ui-field-hint">{copy.momentHint}</p>
                {fieldError.moment ? (
                  <p className="ui-field-error">{fieldError.moment}</p>
                ) : null}
              </div>
            </section>

            <section className="ui-card ui-form-section ui-border-accent">
              <div className="ui-field">
                <label className="ui-field-label" htmlFor="event-location">
                  {copy.locationLabel}
                </label>
                <select
                  id="event-location"
                  className="ui-input ui-input-select"
                  value={locationId == null ? "" : String(locationId)}
                  onChange={(event) => {
                    setLocationId(parseNumericFilter(event.target.value));
                    setFieldError((previous) => ({ ...previous, location: undefined }));
                    setRequestErrorMessage(null);
                  }}
                  disabled={isDeletePending || !canEditForm}
                  aria-invalid={Boolean(fieldError.location)}
                >
                  <option value="" aria-label={copy.filterAllAria}></option>
                  {locationOptionList.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <p className="ui-field-hint">{copy.locationHint}</p>
                {fieldError.location ? (
                  <p className="ui-field-error">{fieldError.location}</p>
                ) : null}
              </div>
            </section>

            <section className="ui-card ui-form-section ui-border-accent">
              <div className="ui-field">
                <label className="ui-field-label" htmlFor="event-unity">
                  {copy.unityLabel}
                </label>
                <select
                  id="event-unity"
                  className="ui-input ui-input-select"
                  value={unityId == null ? "" : String(unityId)}
                  onChange={(event) => {
                    setUnityId(parseNumericFilter(event.target.value));
                    setFieldError((previous) => ({ ...previous, unity: undefined }));
                    setRequestErrorMessage(null);
                  }}
                  disabled={isDeletePending || !canEditForm}
                  aria-invalid={Boolean(fieldError.unity)}
                >
                  <option value="" aria-label={copy.filterAllAria}></option>
                  {unityOptionList.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <p className="ui-field-hint">{copy.unityHint}</p>
                {fieldError.unity ? (
                  <p className="ui-field-error">{fieldError.unity}</p>
                ) : null}
              </div>
            </section>

            <section className="ui-card ui-form-section ui-border-accent">
              <div className="ui-field">
                <label className="ui-field-label" htmlFor="event-action">
                  {copy.actionLabel}
                </label>
                <select
                  id="event-action"
                  className="ui-input ui-input-select"
                  value={actionId == null ? "" : String(actionId)}
                  onChange={(event) => {
                    setActionId(parseNumericFilter(event.target.value));
                    setFieldError((previous) => ({ ...previous, action: undefined }));
                    setRequestErrorMessage(null);
                  }}
                  disabled={isDeletePending || !canEditForm}
                  aria-invalid={Boolean(fieldError.action)}
                >
                  <option value="" aria-label={copy.filterAllAria}></option>
                  {actionOptionList.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <p className="ui-field-hint">{copy.actionHint}</p>
                {fieldError.action ? (
                  <p className="ui-field-error">{fieldError.action}</p>
                ) : null}
              </div>
            </section>

            {isCreateMode ? (
              <ConfigurationInfoSection
                title={copy.sectionInfoTitle}
                description={copy.sectionInfoDescription}
              >
                <ul className="ui-info-topic-list">
                  <li>
                    <p className="ui-info-topic-lead">
                      <span className="ui-info-topic-label">{copy.infoCreateLead}</span>
                    </p>
                    <p className="ui-field-hint ui-info-topic-hint">{copy.infoCreateHint}</p>
                  </li>
                </ul>
              </ConfigurationInfoSection>
            ) : selectedEvent ? (
              <ConfigurationInfoSection
                title={copy.sectionInfoTitle}
                description={copy.sectionInfoDescription}
              >
                <ul className="ui-info-topic-list">
                  <li>
                    <p className="ui-info-topic-lead">
                      <span className="ui-info-topic-label">{copy.infoSummaryLabel}</span>
                      {": "}
                      <span className="ui-info-topic-value">
                        {buildEventSummary(selectedEvent)}
                      </span>
                    </p>
                  </li>
                </ul>
              </ConfigurationInfoSection>
            ) : (
              <ConfigurationInfoSection
                title={copy.sectionInfoTitle}
                description={copy.sectionInfoDescription}
              >
                <ul className="ui-info-topic-list">
                  <li>
                    <p className="ui-info-topic-lead">
                      <span className="ui-info-topic-label">{copy.infoSummaryLabel}</span>
                      {": "}
                      <span className="ui-info-topic-value">{copy.fallbackEvent}</span>
                    </p>
                  </li>
                </ul>
              </ConfigurationInfoSection>
            )}
          </>
        ) : (
          <div className="ui-panel ui-empty-panel">{asideEmptyMessage}</div>
        )
      }
      history={{
        headingId: "event-history-heading",
        title: copy.historyTitle,
        description: copy.historyDescription,
        tableName: "event",
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
          hasEditableContext: Boolean(directory && selectedEventKey),
          canSubmit,
          isSaving,
          isDirty
        }),
        saveLabel: copy.save,
        savingLabel: copy.saving,
        isSaving,
        dangerAction:
          directory && !isCreateMode && selectedEvent ? (
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
