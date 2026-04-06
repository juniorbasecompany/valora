"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { ConfigurationDirectoryCreateButton } from "@/component/configuration/configuration-directory-create-button";
import { ConfigurationDirectoryListToolbarRow } from "@/component/configuration/configuration-directory-list-toolbar-row";
import {
  directoryEditorCanSubmitForDirectoryEditor,
  directoryEditorSaveDisabled
} from "@/component/configuration/configuration-directory-editor-policy";
import { ConfigurationDirectoryEditorShell } from "@/component/configuration/configuration-directory-editor-shell";
import {
  DirectoryFilterCard,
  DirectoryFilterPanel,
  DirectoryFilterTextField
} from "@/component/configuration/directory-filter-panel";
import {
  HierarchyDropdownField,
  HierarchySingleSelectField
} from "@/component/configuration/hierarchy-dropdown-field";
import { TrashIconButton } from "@/component/ui/trash-icon-button";
import { useConfigurationDirectoryFetchGeneration } from "@/component/configuration/use-configuration-directory-fetch-generation";
import { useReplaceConfigurationPath } from "@/component/configuration/use-replace-configuration-path";
import { parseErrorDetail } from "@/lib/api/parse-error-detail";
import type {
  TenantItemRecord,
  TenantLocationDirectoryResponse,
  TenantScopeRecord,
  TenantUnityDirectoryResponse,
  TenantUnityRecord
} from "@/lib/auth/types";
import {
  areItemIdSetsEqual,
  buildItemByIdMap,
  expandPickedItemIdsToStoredList
} from "@/lib/configuration/item-id-ancestry";
import { preferredSelectionKeyAfterEditSave } from "@/lib/navigation/configuration-path";

const UI_TEXT_SEPARATOR = "\u00A0\u00A0●\u00A0\u00A0";

export type UnityConfigurationCopy = {
  title: string;
  description: string;
  emptyScope: string;
  missingCurrentScope: string;
  loadError: string;
  historyTitle: string;
  historyDescription: string;
  filterSearchLabel: string;
  filterToggleAriaLabel: string;
  filterToggleLabel: string;
  locationLabel: string;
  locationAllLabel: string;
  locationHint: string;
  itemSectionLabel: string;
  itemAllLabel: string;
  itemConfirmLabel: string;
  itemHint: string;
  initialAgeLabel: string;
  finalAgeLabel: string;
  ageHint: string;
  validationItem: string;
  validationAge: string;
  validationAgeRequired: string;
  validationLocation: string;
  validationLocationSelect: string;
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
  discardConfirm: string;
};

type UnityConfigurationClientProps = {
  locale: string;
  currentScope: TenantScopeRecord | null;
  hasAnyScope: boolean;
  initialUnityDirectory: TenantUnityDirectoryResponse | null;
  initialLocationDirectory: TenantLocationDirectoryResponse | null;
  itemRecordList: TenantItemRecord[];
  copy: UnityConfigurationCopy;
};

type UnitySelectionKey = number | "new" | null;

function parseSelectedUnityKey(raw: string | null): UnitySelectionKey {
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

function resolveSelectedUnityKey(
  itemList: TenantUnityRecord[],
  preferredKey: UnitySelectionKey,
  canCreate: boolean
): UnitySelectionKey {
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

function sanitizeUnityItemIdListForScope(
  itemIdList: number[],
  itemById: Map<number, TenantItemRecord>
): number[] {
  return itemIdList.filter((id) => itemById.has(id));
}

export function UnityConfigurationClient({
  locale,
  currentScope,
  hasAnyScope,
  initialUnityDirectory,
  initialLocationDirectory,
  itemRecordList,
  copy
}: UnityConfigurationClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSearchUnityKey = parseSelectedUnityKey(searchParams.get("unity"));

  const configurationPath = `/${locale}/app/configuration`;
  const unityPath = `/${locale}/app/configuration/unity`;

  const replacePath = useCallback(
    (nextPath: string) => {
      router.replace(nextPath, { scroll: false });
    },
    [router]
  );

  const [directory, setDirectory] = useState<TenantUnityDirectoryResponse | null>(
    initialUnityDirectory
  );
  const [locationDirectory] = useState<TenantLocationDirectoryResponse | null>(
    initialLocationDirectory
  );

  const initialSelectedUnityKey =
    initialUnityDirectory != null
      ? resolveSelectedUnityKey(
        initialUnityDirectory.item_list,
        initialSearchUnityKey,
        initialUnityDirectory.can_create
      )
      : null;

  const [selectedUnityId, setSelectedUnityId] = useState<number | null>(
    typeof initialSelectedUnityKey === "number" ? initialSelectedUnityKey : null
  );
  const [isCreateMode, setIsCreateMode] = useState(initialSelectedUnityKey === "new");

  const itemById = useMemo(() => buildItemByIdMap(itemRecordList), [itemRecordList]);
  const itemChildrenByParentId = useMemo(() => {
    const next = new Map<number | null, TenantItemRecord[]>();
    for (const item of itemRecordList) {
      const parentId = item.parent_item_id ?? null;
      const siblingList = next.get(parentId) ?? [];
      siblingList.push(item);
      next.set(parentId, siblingList);
    }
    return next;
  }, [itemRecordList]);
  const locationPathById = useMemo(() => {
    const next = new Map<number, string>();
    for (const item of locationDirectory?.item_list ?? []) {
      const label = item.path_labels.length > 0
        ? item.path_labels.join(UI_TEXT_SEPARATOR)
        : item.name.trim() || item.display_name.trim() || `#${item.id}`;
      next.set(item.id, label);
    }
    return next;
  }, [locationDirectory?.item_list]);

  const selectedUnity = useMemo(() => {
    if (isCreateMode) {
      return null;
    }
    return selectedUnityId == null
      ? null
      : (directory?.item_list.find((row) => row.id === selectedUnityId) ?? null);
  }, [directory?.item_list, isCreateMode, selectedUnityId]);

  const [locationId, setLocationId] = useState(selectedUnity?.location_id ?? 0);
  const [pickedItemIdList, setPickedItemIdList] = useState<number[]>(() =>
    selectedUnity
      ? sanitizeUnityItemIdListForScope(selectedUnity.item_id_list, buildItemByIdMap(itemRecordList))
      : []
  );
  const [initialAge, setInitialAge] = useState<number | null>(
    selectedUnity != null ? selectedUnity.initial_age : null
  );
  const [finalAge, setFinalAge] = useState<number | null>(
    selectedUnity != null ? selectedUnity.final_age : null
  );

  const [baseline, setBaseline] = useState<{
    locationId: number;
    itemIdList: number[];
    initialAge: number | null;
    finalAge: number | null;
  }>({
    locationId: selectedUnity?.location_id ?? 0,
    itemIdList: selectedUnity ? [...selectedUnity.item_id_list] : [],
    initialAge: selectedUnity != null ? selectedUnity.initial_age : null,
    finalAge: selectedUnity != null ? selectedUnity.final_age : null
  });

  const [fieldError, setFieldError] = useState<{
    location?: string;
    item?: string;
    age?: string;
  }>({});
  const [requestErrorMessage, setRequestErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeletePending, setIsDeletePending] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [filterQuery, setFilterQuery] = useState("");

  const editorPanelElementRef = useRef<HTMLDivElement | null>(null);
  const selectedUnityKeyRef = useRef<UnitySelectionKey>(initialSelectedUnityKey);
  const didMountFilterRef = useRef(false);

  const {
    bumpAfterProgrammaticSync,
    captureGenerationAtFetchStart,
    isFetchResultStale
  } = useConfigurationDirectoryFetchGeneration();

  useReplaceConfigurationPath(
    unityPath,
    searchParams,
    replacePath,
    "unity",
    directory ? (isCreateMode ? "new" : selectedUnity?.id ?? null) : null
  );

  const syncFromDirectory = useCallback(
    (nextDirectory: TenantUnityDirectoryResponse | null, preferredKey?: UnitySelectionKey) => {
      if (!nextDirectory) {
        setDirectory(null);
        setIsCreateMode(false);
        setSelectedUnityId(null);
        setLocationId(0);
        setPickedItemIdList([]);
        setInitialAge(null);
        setFinalAge(null);
        setBaseline({
          locationId: 0,
          itemIdList: [],
          initialAge: null,
          finalAge: null
        });
        setFieldError({});
        setRequestErrorMessage(null);
        setIsDeletePending(false);
        selectedUnityKeyRef.current = null;
        return null;
      }

      const nextKey = resolveSelectedUnityKey(
        nextDirectory.item_list,
        preferredKey ?? null,
        nextDirectory.can_create
      );
      const nextRow =
        typeof nextKey === "number"
          ? (nextDirectory.item_list.find((row) => row.id === nextKey) ?? null)
          : null;

      const nextLoc = nextRow != null ? nextRow.location_id : 0;
      const nextStoredList = nextRow ? [...nextRow.item_id_list] : [];
      const nextPickedList = sanitizeUnityItemIdListForScope(nextStoredList, itemById);
      const nextInitial = nextRow != null ? nextRow.initial_age : null;
      const nextFinal = nextRow != null ? nextRow.final_age : null;

      setDirectory(nextDirectory);
      setIsCreateMode(nextKey === "new");
      setSelectedUnityId(typeof nextKey === "number" ? nextKey : null);
      setLocationId(nextLoc);
      setPickedItemIdList(nextPickedList);
      setInitialAge(nextInitial);
      setFinalAge(nextFinal);
      setBaseline({
        locationId: nextLoc,
        itemIdList: nextStoredList,
        initialAge: nextInitial,
        finalAge: nextFinal
      });
      setFieldError({});
      setRequestErrorMessage(null);
      setIsDeletePending(false);

      selectedUnityKeyRef.current =
        nextKey === "new" ? "new" : typeof nextKey === "number" ? nextKey : null;

      return nextKey;
    },
    [itemById]
  );

  const expandedItemIdListForSave = useMemo(
    () => expandPickedItemIdsToStoredList(pickedItemIdList, itemById),
    [itemById, pickedItemIdList]
  );

  useEffect(() => {
    syncFromDirectory(initialUnityDirectory, initialSearchUnityKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- alinhamento inicial com snapshot do servidor
  }, []);

  const loadUnityDirectory = useCallback(async () => {
    if (currentScope?.id == null) {
      return;
    }
    const fetchGenerationAtStart = captureGenerationAtFetchStart();
    const query = new URLSearchParams();
    const normalizedQuery = filterQuery.trim();
    if (normalizedQuery) {
      query.set("q", normalizedQuery);
    }
    const search = query.toString() ? `?${query.toString()}` : "";
    try {
      const response = await fetch(
        `/api/auth/tenant/current/scopes/${currentScope.id}/unities${search}`
      );
      const data: unknown = await response.json().catch(() => ({}));
      if (!response.ok) {
        setRequestErrorMessage(parseErrorDetail(data, copy.loadError) ?? copy.loadError);
        return;
      }
      if (isFetchResultStale(fetchGenerationAtStart)) {
        return;
      }
      syncFromDirectory(data as TenantUnityDirectoryResponse, selectedUnityKeyRef.current);
    } catch {
      setRequestErrorMessage(copy.loadError);
    }
  }, [
    captureGenerationAtFetchStart,
    copy.loadError,
    currentScope,
    filterQuery,
    isFetchResultStale,
    syncFromDirectory
  ]);

  useEffect(() => {
    if (!didMountFilterRef.current) {
      didMountFilterRef.current = true;
      return;
    }
    void loadUnityDirectory();
  }, [loadUnityDirectory]);

  const handleStartCreate = useCallback(() => {
    if (!directory?.can_edit || isSaving) {
      return;
    }
    if (!isCreateMode) {
      syncFromDirectory(directory, "new");
      bumpAfterProgrammaticSync();
    }
  }, [bumpAfterProgrammaticSync, directory, isCreateMode, isSaving, syncFromDirectory]);

  const handleSelectUnity = useCallback(
    (item: TenantUnityRecord) => {
      if (!directory) {
        return;
      }
      if (!isCreateMode && item.id === selectedUnity?.id) {
        return;
      }
      syncFromDirectory(directory, item.id);
      bumpAfterProgrammaticSync();
    },
    [bumpAfterProgrammaticSync, directory, isCreateMode, selectedUnity?.id, syncFromDirectory]
  );

  const handleToggleDelete = useCallback(() => {
    if (isSaving) {
      return;
    }
    setRequestErrorMessage(null);
    setIsDeletePending((previous) => !previous);
  }, [isSaving]);

  const isDirty = useMemo(() => {
    const itemEqual = areItemIdSetsEqual(expandedItemIdListForSave, baseline.itemIdList);
    return (
      locationId !== baseline.locationId ||
      !itemEqual ||
      initialAge !== baseline.initialAge ||
      finalAge !== baseline.finalAge ||
      isDeletePending
    );
  }, [
    baseline,
    expandedItemIdListForSave,
    finalAge,
    initialAge,
    isDeletePending,
    locationId
  ]);

  const validate = useCallback(() => {
    if (locationId < 1) {
      const hasLocationList = (locationDirectory?.item_list.length ?? 0) > 0;
      setFieldError({
        location: hasLocationList ? copy.validationLocationSelect : copy.validationLocation
      });
      return false;
    }
    if (pickedItemIdList.length === 0) {
      setFieldError({ item: copy.validationItem });
      return false;
    }
    if (initialAge === null || finalAge === null) {
      setFieldError({ age: copy.validationAgeRequired });
      return false;
    }
    if (initialAge > finalAge) {
      setFieldError({ age: copy.validationAge });
      return false;
    }
    setFieldError({});
    return true;
  }, [
    copy.validationAge,
    copy.validationAgeRequired,
    copy.validationItem,
    copy.validationLocation,
    copy.validationLocationSelect,
    finalAge,
    initialAge,
    locationDirectory?.item_list.length,
    pickedItemIdList.length,
    locationId
  ]);

  const scopeId = currentScope?.id;

  const handleSave = useCallback(async () => {
    setRequestErrorMessage(null);
    if (!directory || scopeId == null) {
      return;
    }
    if (!isDeletePending && !validate()) {
      return;
    }
    setIsSaving(true);
    try {
      if (isCreateMode) {
        const response = await fetch(`/api/auth/tenant/current/scopes/${scopeId}/unities`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            location_id: locationId,
            item_id_list: expandedItemIdListForSave,
            initial_age: initialAge as number,
            final_age: finalAge as number
          })
        });
        const data: unknown = await response.json().catch(() => ({}));
        if (!response.ok) {
          setRequestErrorMessage(
            parseErrorDetail(data, copy.createError) ?? copy.createError
          );
          return;
        }
        const updatedDirectory = data as TenantUnityDirectoryResponse;
        syncFromDirectory(updatedDirectory, "new");
        bumpAfterProgrammaticSync();
        setHistoryRefreshKey((previous) => previous + 1);
        return;
      }

      if (!selectedUnity) {
        return;
      }

      const response = await fetch(
        `/api/auth/tenant/current/scopes/${scopeId}/unities/${selectedUnity.id}`,
        isDeletePending
          ? { method: "DELETE" }
          : {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              location_id: locationId,
              item_id_list: expandedItemIdListForSave,
              initial_age: initialAge as number,
              final_age: finalAge as number
            })
          }
      );
      const data: unknown = await response.json().catch(() => ({}));
      if (!response.ok) {
        const fallback = isDeletePending ? copy.deleteError : copy.saveError;
        setRequestErrorMessage(parseErrorDetail(data, fallback) ?? fallback);
        return;
      }

      const updatedDirectory = data as TenantUnityDirectoryResponse;
      if (isDeletePending) {
        const nextKeyAfterMutation: UnitySelectionKey = updatedDirectory.can_create
          ? "new"
          : null;
        syncFromDirectory(updatedDirectory, nextKeyAfterMutation);
        bumpAfterProgrammaticSync();
      } else {
        syncFromDirectory(
          updatedDirectory,
          preferredSelectionKeyAfterEditSave(updatedDirectory.can_edit, selectedUnity.id)
        );
        bumpAfterProgrammaticSync();
      }
      setHistoryRefreshKey((previous) => previous + 1);
    } catch {
      setRequestErrorMessage(
        isCreateMode ? copy.createError : isDeletePending ? copy.deleteError : copy.saveError
      );
    } finally {
      setIsSaving(false);
    }
  }, [
    bumpAfterProgrammaticSync,
    copy.createError,
    copy.deleteError,
    copy.saveError,
    directory,
    finalAge,
    initialAge,
    isCreateMode,
    isDeletePending,
    expandedItemIdListForSave,
    locationId,
    scopeId,
    selectedUnity,
    syncFromDirectory,
    validate
  ]);

  const canEditForm = isCreateMode
    ? Boolean(directory?.can_create)
    : Boolean(selectedUnity?.can_edit);

  const canSubmit = directoryEditorCanSubmitForDirectoryEditor({
    isCreateMode,
    isDeletePending,
    canCreate: directory?.can_create ?? false,
    canEdit: selectedUnity?.can_edit ?? false
  });

  const footerErrorMessage =
    requestErrorMessage ??
    fieldError.location ??
    fieldError.item ??
    fieldError.age ??
    null;

  const asideEmptyMessage = !currentScope
    ? hasAnyScope
      ? copy.missingCurrentScope
      : copy.emptyScope
    : copy.loadError;

  const formatCreationDate = useCallback(
    (value: string) => {
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        return value;
      }
      return new Intl.DateTimeFormat(locale, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      }).format(parsed);
    },
    [locale]
  );
  const resolveUnityLocationPath = useCallback(
    (item: TenantUnityRecord) =>
      locationPathById.get(item.location_id) ?? item.location_display_name,
    [locationPathById]
  );
  const resolveUnityItemHierarchyRows = useCallback(
    (item: TenantUnityRecord) => {
      const selectedIdSet = new Set(item.item_id_list);
      const visitedIdSet = new Set<number>();
      const rows: Array<{ id: number; depth: number; label: string }> = [];

      function appendBranch(parentId: number | null) {
        const childList = itemChildrenByParentId.get(parentId) ?? [];
        for (const row of childList) {
          if (!selectedIdSet.has(row.id) || visitedIdSet.has(row.id)) {
            continue;
          }
          visitedIdSet.add(row.id);
          rows.push({
            id: row.id,
            depth: row.depth,
            label: row.name.trim() || row.display_name.trim() || `#${row.id}`
          });
          appendBranch(row.id);
        }
      }

      appendBranch(null);

      for (const id of item.item_id_list) {
        const row = itemById.get(id);
        if (!row || visitedIdSet.has(row.id)) {
          continue;
        }
        rows.push({
          id: row.id,
          depth: row.depth,
          label: row.name.trim() || row.display_name.trim() || `#${row.id}`
        });
      }

      return rows;
    },
    [itemById, itemChildrenByParentId]
  );

  return (
    <ConfigurationDirectoryEditorShell
      headerTitle={copy.title}
      headerDescription={copy.description}
      filter={
        directory
          ? {
            panel: (
              <DirectoryFilterPanel>
                <DirectoryFilterCard>
                  <DirectoryFilterTextField
                    id="unity-filter-search"
                    label={copy.filterSearchLabel}
                    value={filterQuery}
                    onChange={setFilterQuery}
                  />
                </DirectoryFilterCard>
              </DirectoryFilterPanel>
            ),
            storageSegment: "unity"
          }
          : undefined
      }
      editorPanelRef={editorPanelElementRef}
      isDeletePending={isDeletePending}
      directoryAside={
        <>
          {!directory ? (
            <div className="ui-panel ui-empty-panel">{asideEmptyMessage}</div>
          ) : null}

          {directory && !directory.can_edit ? (
            <div className="ui-notice-attention ui-notice-block">{copy.readOnlyNotice}</div>
          ) : null}

          <div className="ui-directory-list">
            <ConfigurationDirectoryListToolbarRow
              showFilterToggle={directory != null}
              filterSegment="unity"
              filterToggleAriaLabel={copy.filterToggleAriaLabel}
              filterToggleLabel={copy.filterToggleLabel}
              end={
                directory?.can_edit ? (
                  <ConfigurationDirectoryCreateButton
                    label={copy.directoryCreateLabel}
                    active={isCreateMode}
                    disabled={isSaving}
                    onClick={handleStartCreate}
                    wrapInToolbar={false}
                  />
                ) : null
              }
            />

            {directory && directory.item_list.length > 0
              ? directory.item_list.map((item) => (
                <Fragment key={item.id}>
                  <button
                    type="button"
                    onClick={() => handleSelectUnity(item)}
                    className="ui-directory-item"
                    data-selected={item.id === selectedUnity?.id ? "true" : undefined}
                    data-delete-pending={
                      item.id === selectedUnity?.id && isDeletePending ? "true" : undefined
                    }
                  >
                    <p className="ui-directory-title-wrap ui-directory-title-emphasis">
                      {resolveUnityLocationPath(item)}
                    </p>
                    <div className="ui-directory-hierarchy" aria-hidden>
                      {resolveUnityItemHierarchyRows(item).map((row) => (
                        <p
                          key={`${item.id}:${row.id}`}
                          className="ui-directory-hierarchy-row ui-directory-title-emphasis"
                          style={
                            {
                              "--ui-directory-hierarchy-depth": String(row.depth)
                            } as CSSProperties
                          }
                        >
                          <span>{row.label}</span>
                        </p>
                      ))}
                    </div>
                    <p className="ui-directory-caption">
                      {formatCreationDate(item.creation_utc)}
                    </p>
                  </button>
                </Fragment>
              ))
              : null}

            {directory && directory.item_list.length === 0 && !directory.can_edit ? (
              <div className="ui-panel ui-empty-panel ui-panel-body-compact">
                {copy.loadError}
              </div>
            ) : null}
          </div>
        </>
      }
      editorForm={
        directory ? (
          <>
            <section className="ui-card ui-form-section ui-border-accent">
              <HierarchySingleSelectField
                id="unity-location"
                label={copy.locationLabel}
                itemList={locationDirectory?.item_list ?? []}
                primaryField
                value={locationId > 0 ? locationId : null}
                onChange={(nextValue) => {
                  setLocationId(nextValue ?? 0);
                  setRequestErrorMessage(null);
                  setFieldError((previous) => ({ ...previous, location: undefined }));
                }}
                getParentId={(item) => item.parent_location_id ?? null}
                allLabel={copy.locationAllLabel}
                disabled={isDeletePending || !canEditForm}
                ariaInvalid={Boolean(fieldError.location)}
              />
              <p className="ui-field-hint">{copy.locationHint}</p>
              {fieldError.location ? (
                <p className="ui-field-error">{fieldError.location}</p>
              ) : null}
            </section>

            <section className="ui-card ui-form-section ui-border-accent">
              <HierarchyDropdownField
                id="unity-item"
                label={copy.itemSectionLabel}
                itemList={itemRecordList}
                selectedValueList={pickedItemIdList}
                onChange={(nextList) => {
                  setPickedItemIdList(nextList);
                  setRequestErrorMessage(null);
                  setFieldError((previous) => ({ ...previous, item: undefined }));
                }}
                getParentId={(row) => row.parent_item_id ?? null}
                allLabel={copy.itemAllLabel}
                confirmLabel={copy.itemConfirmLabel}
                multiToggleMode="independent"
                disabled={isDeletePending || !canEditForm}
              />
              <p className="ui-field-hint">{copy.itemHint}</p>
              {fieldError.item ? <p className="ui-field-error">{fieldError.item}</p> : null}
            </section>

            <section className="ui-card ui-form-section ui-border-accent">
              <div className="ui-field">
                <label className="ui-field-label" htmlFor="unity-initial-age">
                  {copy.initialAgeLabel}
                </label>
                <input
                  id="unity-initial-age"
                  type="number"
                  className="ui-input"
                  value={initialAge === null ? "" : String(initialAge)}
                  disabled={isDeletePending || !canEditForm}
                  onChange={(event) => {
                    const raw = event.target.value.trim();
                    if (raw === "") {
                      setInitialAge(null);
                    } else {
                      const n = Number.parseInt(raw, 10);
                      setInitialAge(Number.isNaN(n) ? null : n);
                    }
                    setFieldError((previous) => ({ ...previous, age: undefined }));
                    setRequestErrorMessage(null);
                  }}
                />
              </div>
              <div className="ui-field">
                <label className="ui-field-label" htmlFor="unity-final-age">
                  {copy.finalAgeLabel}
                </label>
                <input
                  id="unity-final-age"
                  type="number"
                  className="ui-input"
                  value={finalAge === null ? "" : String(finalAge)}
                  disabled={isDeletePending || !canEditForm}
                  onChange={(event) => {
                    const raw = event.target.value.trim();
                    if (raw === "") {
                      setFinalAge(null);
                    } else {
                      const n = Number.parseInt(raw, 10);
                      setFinalAge(Number.isNaN(n) ? null : n);
                    }
                    setFieldError((previous) => ({ ...previous, age: undefined }));
                    setRequestErrorMessage(null);
                  }}
                />
                <p className="ui-field-hint">{copy.ageHint}</p>
                {fieldError.age ? <p className="ui-field-error">{fieldError.age}</p> : null}
              </div>
            </section>
          </>
        ) : (
          <div className="ui-panel ui-empty-panel">{asideEmptyMessage}</div>
        )
      }
      history={{
        headingId: "unity-history-heading",
        title: copy.historyTitle,
        description: copy.historyDescription,
        tableName: "unity",
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
          hasEditableContext: Boolean(directory && (isCreateMode || selectedUnity)),
          canSubmit,
          isSaving,
          isDirty
        }),
        saveLabel: copy.save,
        savingLabel: copy.saving,
        isSaving,
        dangerAction:
          directory && !isCreateMode && selectedUnity ? (
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
