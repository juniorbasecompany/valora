"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  directoryEditorCanSubmitForDirectoryEditor,
  directoryEditorSaveDisabled
} from "@/component/configuration/configuration-directory-editor-policy";
import { ConfigurationDirectoryEditorShell } from "@/component/configuration/configuration-directory-editor-shell";
import { ConfigurationDirectoryCreateButton } from "@/component/configuration/configuration-directory-create-button";
import { ConfigurationDirectoryListToolbarRow } from "@/component/configuration/configuration-directory-list-toolbar-row";
import { EventActionField } from "@/component/configuration/event-action-field";
import { EventFilterPanel } from "@/component/configuration/event-filter-panel";
import { HierarchySingleSelectField } from "@/component/configuration/hierarchy-dropdown-field";
import { TrashIconButton } from "@/component/ui/trash-icon-button";
import { EditorPanelFlashOverlay } from "@/component/configuration/editor-panel-flash-overlay";
import { useEditorPanelFlash } from "@/component/configuration/use-editor-panel-flash";
import { useEditorNewIntentGeneration } from "@/component/configuration/use-editor-new-intent-generation";
import { useFocusFirstEditorFieldAfterFlash } from "@/component/configuration/use-focus-first-editor-field-after-flash";
import { useConfigurationDirectoryFetchGeneration } from "@/component/configuration/use-configuration-directory-fetch-generation";
import { useReplaceConfigurationPath } from "@/component/configuration/use-replace-configuration-path";
import type {
  ScopeFormulaListResponse,
  ScopeInputListResponse,
  TenantLocationDirectoryResponse,
  TenantScopeActionDirectoryResponse,
  TenantScopeEventDirectoryResponse,
  TenantScopeEventRecord,
  TenantScopeFieldDirectoryResponse,
  TenantScopeRecord,
  TenantItemDirectoryResponse,
  TenantUnityDirectoryResponse,
  TenantUnityRecord
} from "@/lib/auth/types";
import { parseErrorCode, parseErrorDetail } from "@/lib/api/parse-error-detail";
import {
  cachedDirectoryJsonFetch,
  invalidateDirectoryRequestCache
} from "@/lib/api/directory-request-cache";
import type { LabelLang } from "@/lib/i18n/label-lang";
import {
  filterItemListByUnity,
  filterLocationListByUnity
} from "@/lib/configuration/unity-hierarchy-filter";
import {
  applyConfigurationSelectionToWindowHistory,
  preferredSelectionKeyAfterEditSave
} from "@/lib/navigation/configuration-path";

const UI_TEXT_SEPARATOR = "\u00A0\u00A0●\u00A0\u00A0";

export type EventConfigurationCopy = {
  title: string;
  description: string;
  emptyScope: string;
  missingCurrentScope: string;
  loadError: string;
  historyTitle: string;
  historyDescription: string;
  ageLabel: string;
  ageHint: string;
  unityLabel?: string;
  unityHint?: string;
  locationLabel: string;
  locationHint: string;
  itemLabel: string;
  itemHint: string;
  actionLabel: string;
  actionHint: string;
  actionInputSectionTitle: string;
  actionInputSectionHint: string;
  actionInputLoadingAriaLabel: string;
  actionInputLoadError: string;
  actionInputSaveError: string;
  filterTitle: string;
  filterToggleAriaLabel: string;
  filterToggleLabel: string;
  filterAgeFromLabel: string;
  filterAgeToLabel: string;
  filterLocationLabel: string;
  filterItemLabel: string;
  filterActionLabel: string;
  filterAll: string;
  filterAllAria: string;
  filterConfirm: string;
  fallbackLocation: string;
  fallbackUnity: string;
  fallbackItem: string;
  fallbackAction: string;
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
  ageRequired?: string;
  unityRequired?: string;
  locationRequired: string;
  itemRequired: string;
  actionRequired: string;
  discardConfirm: string;
  currentAgeFieldMissing?: string;
  /** Mensagens por `detail.code` da API de eventos (REST); ver `rules.py`. */
  scopeEventApiError?: Partial<Record<string, string>>;
};

function resolveScopeEventHttpErrorMessage(
  payload: unknown,
  scopeEventApiError: EventConfigurationCopy["scopeEventApiError"],
  fallback: string
): string {
  const code = parseErrorCode(payload);
  if (code && scopeEventApiError) {
    const mapped = scopeEventApiError[code];
    if (typeof mapped === "string" && mapped.trim()) {
      return mapped;
    }
  }
  return parseErrorDetail(payload, fallback) ?? fallback;
}

type EventConfigurationClientProps = {
  locale: string;
  labelLang: LabelLang;
  /** Fatos: `unity_id` obrigatório. Padrão (standard): `unity_id` ausente. `age` obrigatório em ambos. */
  variant: "fact" | "standard";
  /** Base da rota para query `?event=`, ex. `/${locale}/app/configuration/event/fact`. */
  basePath: string;
  currentScope: TenantScopeRecord | null;
  hasAnyScope: boolean;
  initialEventDirectory: TenantScopeEventDirectoryResponse | null;
  initialLocationDirectory: TenantLocationDirectoryResponse | null;
  initialItemDirectory: TenantItemDirectoryResponse | null;
  initialActionDirectory: TenantScopeActionDirectoryResponse | null;
  initialUnityDirectory: TenantUnityDirectoryResponse | null;
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

/** Lista do diretório: menor `age` primeiro (mesma regra da API `list_scope_events`). */
function sortEventDirectoryItemListOldestFirst(
  itemList: TenantScopeEventRecord[],
  actionSortOrderById: Map<number, number>
): TenantScopeEventRecord[] {
  return [...itemList].sort((left, right) => {
    const byAge = left.age - right.age;
    if (byAge !== 0) {
      return byAge;
    }
    const byActionSortOrder =
      (actionSortOrderById.get(left.action_id) ?? Number.MAX_SAFE_INTEGER)
      - (actionSortOrderById.get(right.action_id) ?? Number.MAX_SAFE_INTEGER);
    if (byActionSortOrder !== 0) {
      return byActionSortOrder;
    }
    return left.id - right.id;
  });
}

/** Eventos padrão: ordenação por local, item, ação, idade e id. */
function sortEventDirectoryItemListStandardFirst(
  itemList: TenantScopeEventRecord[],
  actionSortOrderById: Map<number, number>
): TenantScopeEventRecord[] {
  return [...itemList].sort((left, right) => {
    const byLoc = left.location_id - right.location_id;
    if (byLoc !== 0) {
      return byLoc;
    }
    const byItem = left.item_id - right.item_id;
    if (byItem !== 0) {
      return byItem;
    }
    const byActionSortOrder =
      (actionSortOrderById.get(left.action_id) ?? Number.MAX_SAFE_INTEGER)
      - (actionSortOrderById.get(right.action_id) ?? Number.MAX_SAFE_INTEGER);
    if (byActionSortOrder !== 0) {
      return byActionSortOrder;
    }
    const byAge = left.age - right.age;
    if (byAge !== 0) {
      return byAge;
    }
    return left.id - right.id;
  });
}

function resolveSelectedEventKey(
  itemList: TenantScopeEventRecord[],
  preferredKey: EventSelectionKey,
  canCreate: boolean
): EventSelectionKey {
  /* Sem `?event=` na URL: mesmo padrão que campo/ação/hierarquia — formulário vazio (novo). */
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

function parseNonNegativeInt(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
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

type ScopeFieldOption = {
  id: number;
  sqlType: string;
  label: string;
  is_current_age: boolean;
};

type EventActionInputDraft = {
  fieldId: number;
  sqlType: string;
  label: string;
  value: string;
  serverInputId?: number;
};

const FORMULA_INPUT_TOKEN_PATTERN = /\$\{input:(\d+)\}/g;

function cloneEventActionInputDraftList(
  inputDraftList: EventActionInputDraft[]
): EventActionInputDraft[] {
  return inputDraftList.map((item) => ({ ...item }));
}

function buildEventInputSummary(
  inputDraftList: EventActionInputDraft[]
): string | null {
  const valueSummaryList = inputDraftList
    .map((item) => ({
      label: item.label.trim(),
      value: item.value.trim()
    }))
    .filter((item) => item.value.length > 0)
    .map((item) => `${item.label || "-"}: ${item.value}`);

  if (valueSummaryList.length === 0) {
    return null;
  }

  return valueSummaryList.join(UI_TEXT_SEPARATOR);
}

function mergeScopeFieldMetadataIntoDraftList(
  draftList: EventActionInputDraft[],
  fieldList: ScopeFieldOption[]
): EventActionInputDraft[] {
  if (draftList.length === 0 || fieldList.length === 0) {
    return draftList;
  }
  return draftList.map((draft) => {
    const scopeField = fieldList.find((item) => item.id === draft.fieldId);
    if (scopeField == null) {
      return draft;
    }
    return {
      ...draft,
      sqlType: scopeField.sqlType,
      label: scopeField.label
    };
  });
}

function areEventActionInputDraftListsEqual(
  leftList: EventActionInputDraft[],
  rightList: EventActionInputDraft[]
): boolean {
  if (leftList.length !== rightList.length) {
    return false;
  }
  for (let index = 0; index < leftList.length; index += 1) {
    const left = leftList[index];
    const right = rightList[index];
    if (
      left.fieldId !== right.fieldId
      || left.sqlType !== right.sqlType
      || left.label !== right.label
      || left.value !== right.value
      || left.serverInputId !== right.serverInputId
    ) {
      return false;
    }
  }
  return true;
}

function updateEventDirectoryInputSummary(
  directory: TenantScopeEventDirectoryResponse,
  eventId: number,
  inputSummary: string | null
): TenantScopeEventDirectoryResponse {
  return {
    ...directory,
    item_list: directory.item_list.map((item) =>
      item.id === eventId
        ? {
          ...item,
          input_summary: inputSummary
        }
        : item
    )
  };
}

function buildFormulaInputFieldIdList(response: ScopeFormulaListResponse): number[] {
  const seenIdSet = new Set<number>();
  const inputFieldIdList: number[] = [];
  const sortedFormulaList = [...response.item_list].sort(
    (left, right) => left.sort_order - right.sort_order || left.id - right.id
  );

  for (const formula of sortedFormulaList) {
    const regex = new RegExp(FORMULA_INPUT_TOKEN_PATTERN.source, "g");
    let match: RegExpExecArray | null;
    while ((match = regex.exec(formula.statement)) != null) {
      const parsedId = Number(match[1]);
      if (!Number.isInteger(parsedId) || parsedId < 1 || seenIdSet.has(parsedId)) {
        continue;
      }
      seenIdSet.add(parsedId);
      inputFieldIdList.push(parsedId);
    }
  }

  return inputFieldIdList;
}

function normalizeScopeFieldOptionList(
  response: TenantScopeFieldDirectoryResponse
): ScopeFieldOption[] {
  return response.item_list.map((item) => ({
    id: item.id,
    sqlType: item.sql_type,
    label: item.label_name?.trim() || `#${item.id}`,
    is_current_age: item.is_current_age
  }));
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
  labelLang,
  variant,
  basePath,
  currentScope,
  hasAnyScope,
  initialEventDirectory,
  initialLocationDirectory,
  initialItemDirectory,
  initialActionDirectory,
  initialUnityDirectory,
  copy
}: EventConfigurationClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSearchEventKey = parseSelectedEventKey(searchParams.get("event"));

  const configurationPath = `/${locale}/app`;
  const eventPath = basePath;

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
        ? item.path_labels.join(UI_TEXT_SEPARATOR)
        : item.name.trim() || `#${item.id}`;
      map.set(item.id, label);
    }
    return map;
  }, [initialLocationDirectory?.item_list]);

  const itemLabelMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const item of initialItemDirectory?.item_list ?? []) {
      const label = item.path_labels.length > 0
        ? item.path_labels.join(UI_TEXT_SEPARATOR)
        : item.name.trim() || `#${item.id}`;
      map.set(item.id, label);
    }
    return map;
  }, [initialItemDirectory?.item_list]);

  const actionMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const item of initialActionDirectory?.item_list ?? []) {
      map.set(item.id, item.label_name?.trim() || `#${item.id}`);
    }
    return map;
  }, [initialActionDirectory?.item_list]);

  const actionSortOrderById = useMemo(() => {
    const map = new Map<number, number>();
    for (const item of initialActionDirectory?.item_list ?? []) {
      map.set(item.id, item.sort_order);
    }
    return map;
  }, [initialActionDirectory?.item_list]);

  const actionOptionList = useMemo(
    () =>
      (initialActionDirectory?.item_list ?? []).map((item) => ({
        id: item.id,
        label: item.label_name?.trim() || `#${item.id}`
      })),
    [initialActionDirectory?.item_list]
  );

  const unityOptionList = useMemo(
    () =>
      (initialUnityDirectory?.item_list ?? []).map((item) => ({
        id: item.id,
        label: item.name.trim() || `#${item.id}`
      })),
    [initialUnityDirectory?.item_list]
  );

  const unityRecordById = useMemo(() => {
    const map = new Map<number, TenantUnityRecord>();
    for (const item of initialUnityDirectory?.item_list ?? []) {
      map.set(item.id, item);
    }
    return map;
  }, [initialUnityDirectory?.item_list]);

  const unityMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const [id, record] of unityRecordById) {
      map.set(id, record.name.trim() || `#${id}`);
    }
    return map;
  }, [unityRecordById]);

  const [directory, setDirectory] = useState<TenantScopeEventDirectoryResponse | null>(() =>
    initialEventDirectory == null
      ? null
      : {
        ...initialEventDirectory,
        item_list:
          variant === "fact"
            ? sortEventDirectoryItemListOldestFirst(
              initialEventDirectory.item_list,
              actionSortOrderById
            )
            : sortEventDirectoryItemListStandardFirst(
              initialEventDirectory.item_list,
              actionSortOrderById
            )
      }
  );

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
  const [ageInput, setAgeInput] = useState(
    initialSelectedEvent
      ? String(initialSelectedEvent.age)
      : variant === "standard"
        ? ""
        : "0"
  );
  const [unityId, setUnityId] = useState<number | null>(
    variant === "standard" ? null : (initialSelectedEvent?.unity_id ?? null)
  );
  const [locationId, setLocationId] = useState<number | null>(
    initialSelectedEvent?.location_id ?? null
  );
  const [itemId, setItemId] = useState<number | null>(
    initialSelectedEvent?.item_id ?? null
  );
  const [actionId, setActionId] = useState<number | null>(
    initialSelectedEvent?.action_id ?? null
  );
  const [baseline, setBaseline] = useState({
    ageInput: initialSelectedEvent
      ? String(initialSelectedEvent.age)
      : variant === "standard"
        ? ""
        : "0",
    unityId: variant === "standard" ? null : (initialSelectedEvent?.unity_id ?? null),
    locationId: initialSelectedEvent?.location_id ?? null,
    itemId: initialSelectedEvent?.item_id ?? null,
    actionId: initialSelectedEvent?.action_id ?? null
  });
  const [fieldError, setFieldError] = useState<{
    age?: string;
    unity?: string;
    location?: string;
    item?: string;
    action?: string;
    currentAge?: string;
  }>({});
  const [requestErrorMessage, setRequestErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeletePending, setIsDeletePending] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [filterAgeFromInput, setFilterAgeFromInput] = useState("");
  const [filterAgeToInput, setFilterAgeToInput] = useState("");
  const [filterLocationIdList, setFilterLocationIdList] = useState<number[]>([]);
  const [filterItemIdList, setFilterItemIdList] = useState<number[]>([]);
  const [filterActionId, setFilterActionId] = useState<number | null>(null);
  const [scopeFieldOptionList, setScopeFieldOptionList] = useState<ScopeFieldOption[]>([]);
  const scopeFieldOptionListRef = useRef<ScopeFieldOption[]>(scopeFieldOptionList);
  scopeFieldOptionListRef.current = scopeFieldOptionList;
  const currentAgeField = useMemo(
    () => scopeFieldOptionList.find((item) => item.is_current_age) ?? null,
    [scopeFieldOptionList]
  );
  const [eventActionInputDraftList, setEventActionInputDraftList] = useState<
    EventActionInputDraft[]
  >([]);
  const [eventActionInputBaselineList, setEventActionInputBaselineList] = useState<
    EventActionInputDraft[]
  >([]);
  const [eventActionInputOrphanServerIdList, setEventActionInputOrphanServerIdList] = useState<
    number[]
  >([]);
  const [actionInputLoading, setActionInputLoading] = useState(false);
  const [actionInputErrorMessage, setActionInputErrorMessage] = useState<string | null>(null);
  const editorPanelElementRef = useRef<HTMLDivElement | null>(null);
  const { newIntentGeneration, bumpNewIntent } = useEditorNewIntentGeneration();
  const selectedEventKeyRef = useRef<EventSelectionKey>(initialSelectedEventKey);
  const {
    bumpAfterProgrammaticSync,
    captureGenerationAtFetchStart,
    isFetchResultStale
  } = useConfigurationDirectoryFetchGeneration();

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

  const selectedUnityRecord = useMemo(
    () => (unityId == null ? null : unityRecordById.get(unityId) ?? null),
    [unityId, unityRecordById]
  );

  const filteredLocationItemList = useMemo(
    () =>
      filterLocationListByUnity(
        initialLocationDirectory?.item_list ?? [],
        selectedUnityRecord
      ),
    [initialLocationDirectory?.item_list, selectedUnityRecord]
  );

  const filteredItemItemList = useMemo(
    () =>
      filterItemListByUnity(initialItemDirectory?.item_list ?? [], selectedUnityRecord),
    [initialItemDirectory?.item_list, selectedUnityRecord]
  );

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
      return `new:${String(newIntentGeneration)}`;
    }
    if (!selectedEvent) {
      return null;
    }
    return `id:${String(selectedEvent.id)}`;
  }, [directory, isCreateMode, newIntentGeneration, selectedEvent]);

  const isEditorFlashActive = useEditorPanelFlash(editorPanelElementRef, editorFlashKey);
  useFocusFirstEditorFieldAfterFlash(
    editorPanelElementRef,
    isEditorFlashActive,
    Boolean(directory)
  );

  const syncFromDirectory = useCallback(
    (
      nextDirectory: TenantScopeEventDirectoryResponse | null,
      preferredKey?: EventSelectionKey
    ) => {
      if (!nextDirectory) {
        setDirectory(null);
        setIsCreateMode(false);
        setSelectedEventId(null);
        const nextAgeInput = variant === "standard" ? "" : "0";
        setAgeInput(nextAgeInput);
        setUnityId(null);
        setLocationId(null);
        setItemId(null);
        setActionId(null);
        setBaseline({
          ageInput: nextAgeInput,
          unityId: null,
          locationId: null,
          itemId: null,
          actionId: null
        });
        setFieldError({});
        setRequestErrorMessage(null);
        setIsDeletePending(false);
        selectedEventKeyRef.current = null;
      return null;
    }

    const directoryWithSortedList: TenantScopeEventDirectoryResponse = {
        ...nextDirectory,
        item_list:
          variant === "fact"
            ? sortEventDirectoryItemListOldestFirst(
              nextDirectory.item_list,
              actionSortOrderById
            )
            : sortEventDirectoryItemListStandardFirst(
              nextDirectory.item_list,
              actionSortOrderById
            )
      };

      const nextKey = resolveSelectedEventKey(
        directoryWithSortedList.item_list,
        preferredKey ?? null,
        directoryWithSortedList.can_edit
      );
      const nextSelectedEvent =
        typeof nextKey === "number"
          ? directoryWithSortedList.item_list.find((item) => item.id === nextKey) ?? null
          : null;

      const nextAgeInput = nextSelectedEvent
        ? String(nextSelectedEvent.age)
        : variant === "standard"
          ? ""
          : "0";
      const nextUnityId =
        variant === "standard" ? null : (nextSelectedEvent?.unity_id ?? null);
      const nextLocationId = nextSelectedEvent?.location_id ?? null;
      const nextItemId = nextSelectedEvent?.item_id ?? null;
      const nextActionId = nextSelectedEvent?.action_id ?? null;

      setDirectory(directoryWithSortedList);
      setIsCreateMode(nextKey === "new");
      setSelectedEventId(typeof nextKey === "number" ? nextKey : null);
      setAgeInput(nextAgeInput);
      setUnityId(nextUnityId);
      setLocationId(nextLocationId);
      setItemId(nextItemId);
      setActionId(nextActionId);
      setBaseline({
        ageInput: nextAgeInput,
        unityId: nextUnityId,
        locationId: nextLocationId,
        itemId: nextItemId,
        actionId: nextActionId
      });
      setFieldError({});
      setRequestErrorMessage(null);
      setIsDeletePending(false);

      selectedEventKeyRef.current =
        nextKey === "new" ? "new" : typeof nextKey === "number" ? nextKey : null;

      return nextKey;
    },
    [actionSortOrderById, variant]
  );

  const applySyncFromHandlers = useCallback(
    (
      nextDirectory: TenantScopeEventDirectoryResponse | null,
      preferredKey?: EventSelectionKey
    ) => {
      const keyForUrl: EventSelectionKey =
        preferredKey ?? selectedEventKeyRef.current;
      applyConfigurationSelectionToWindowHistory(eventPath, "event", keyForUrl);
      syncFromDirectory(nextDirectory, preferredKey);
      bumpAfterProgrammaticSync();
    },
    [bumpAfterProgrammaticSync, eventPath, syncFromDirectory]
  );

  const scopeId = currentScope?.id;

  const loadScopeFieldOptionList = useCallback(async () => {
    if (scopeId == null) {
      setScopeFieldOptionList([]);
      return;
    }

    const query = new URLSearchParams({ label_lang: labelLang });
    const url = `/api/auth/tenant/current/scopes/${scopeId}/fields?${query.toString()}`;
    const result = await cachedDirectoryJsonFetch<TenantScopeFieldDirectoryResponse>(url);
    if (!result.ok || result.data == null) {
      setScopeFieldOptionList([]);
      return;
    }
    setScopeFieldOptionList(normalizeScopeFieldOptionList(result.data));
  }, [labelLang, scopeId]);

  useEffect(() => {
    void loadScopeFieldOptionList();
  }, [loadScopeFieldOptionList]);

  const loadEventDirectory = useCallback(async () => {
    if (scopeId == null) {
      syncFromDirectory(null, null);
      return;
    }

    const fetchGenerationAtStart = captureGenerationAtFetchStart();
    const query = new URLSearchParams();
    const filterAgeFrom = parseNonNegativeInt(filterAgeFromInput);
    const filterAgeTo = parseNonNegativeInt(filterAgeToInput);
    if (filterAgeFrom != null) {
      query.set("age_from", String(filterAgeFrom));
    }
    if (filterAgeTo != null) {
      query.set("age_to", String(filterAgeTo));
    }
    for (const locationId of filterLocationIdList) {
      query.append("location_id", String(locationId));
    }
    for (const itemId of filterItemIdList) {
      query.append("item_id", String(itemId));
    }
    if (filterActionId != null) {
      query.set("action_id", String(filterActionId));
    }
    query.set("label_lang", labelLang);
    query.set("event_kind", variant === "standard" ? "standard" : "fact");

    const url = `/api/auth/tenant/current/scopes/${scopeId}/events?${query.toString()}`;
    const result = await cachedDirectoryJsonFetch<TenantScopeEventDirectoryResponse>(url);
    if (!result.ok) {
      setRequestErrorMessage(parseErrorDetail(result.data, copy.loadError) ?? copy.loadError);
      return;
    }
    if (isFetchResultStale(fetchGenerationAtStart)) {
      return;
    }
    if (result.data != null) {
      syncFromDirectory(result.data, selectedEventKeyRef.current);
    }
  },
    [
      captureGenerationAtFetchStart,
      copy.loadError,
      filterActionId,
      filterLocationIdList,
      filterAgeFromInput,
      filterAgeToInput,
      filterItemIdList,
      isFetchResultStale,
      labelLang,
      scopeId,
      syncFromDirectory,
      variant
    ]
  );

  useEffect(() => {
    void loadEventDirectory();
  }, [loadEventDirectory]);

  useEffect(() => {
    if (scopeId == null || actionId == null) {
      setActionInputLoading(false);
      setActionInputErrorMessage(null);
      setEventActionInputDraftList([]);
      setEventActionInputBaselineList([]);
      setEventActionInputOrphanServerIdList([]);
      return;
    }

    let active = true;
    const loadActionInputState = async () => {
      setActionInputLoading(true);
      setActionInputErrorMessage(null);
      try {
        const formulaResponse = await fetch(
          `/api/auth/tenant/current/scopes/${scopeId}/actions/${actionId}/formulas`
        );
        const formulaData: unknown = await formulaResponse.json().catch(() => ({}));
        if (!formulaResponse.ok) {
          if (!active) {
            return;
          }
          setActionInputErrorMessage(
            parseErrorDetail(formulaData, copy.actionInputLoadError) ?? copy.actionInputLoadError
          );
          setEventActionInputDraftList([]);
          setEventActionInputBaselineList([]);
          setEventActionInputOrphanServerIdList([]);
          return;
        }

        const formulaListResponse = formulaData as ScopeFormulaListResponse;
        const inputFieldIdList = buildFormulaInputFieldIdList(formulaListResponse);
        let inputItemList: ScopeInputListResponse["item_list"] = [];
        if (!isCreateMode && selectedEventId != null) {
          const inputResponse = await fetch(
            `/api/auth/tenant/current/scopes/${scopeId}/events/${selectedEventId}/inputs`
          );
          const inputData: unknown = await inputResponse.json().catch(() => ({}));
          if (!inputResponse.ok) {
            if (!active) {
              return;
            }
            setActionInputErrorMessage(
              parseErrorDetail(inputData, copy.actionInputLoadError) ?? copy.actionInputLoadError
            );
            setEventActionInputDraftList([]);
            setEventActionInputBaselineList([]);
            setEventActionInputOrphanServerIdList([]);
            return;
          }
          inputItemList = (inputData as ScopeInputListResponse).item_list;
        }

        const scopeFieldByIdMap = new Map<number, ScopeFieldOption>();
        for (const scopeField of scopeFieldOptionListRef.current) {
          scopeFieldByIdMap.set(scopeField.id, scopeField);
        }
        const inputByFieldIdMap = new Map<number, ScopeInputListResponse["item_list"][number]>();
        for (const input of inputItemList) {
          inputByFieldIdMap.set(input.field_id, input);
        }
        const inputFieldIdSet = new Set<number>(inputFieldIdList);
        const orphanServerIdList = inputItemList
          .filter((input) => !inputFieldIdSet.has(input.field_id))
          .map((input) => input.id);

        const nextInputDraftList: EventActionInputDraft[] = inputFieldIdList.map((fieldId) => {
          const scopeField = scopeFieldByIdMap.get(fieldId);
          const savedInput = inputByFieldIdMap.get(fieldId);
          return {
            fieldId,
            sqlType: scopeField?.sqlType ?? "text",
            label: scopeField?.label ?? `#${fieldId}`,
            value: savedInput?.value ?? "",
            serverInputId: savedInput?.id
          };
        });

        if (!active) {
          return;
        }
        setEventActionInputDraftList(nextInputDraftList);
        setEventActionInputBaselineList(cloneEventActionInputDraftList(nextInputDraftList));
        setEventActionInputOrphanServerIdList(orphanServerIdList);
      } catch {
        if (!active) {
          return;
        }
        setActionInputErrorMessage(copy.actionInputLoadError);
        setEventActionInputDraftList([]);
        setEventActionInputBaselineList([]);
        setEventActionInputOrphanServerIdList([]);
      } finally {
        if (active) {
          setActionInputLoading(false);
        }
      }
    };

    void loadActionInputState();
    return () => {
      active = false;
    };
  }, [actionId, copy.actionInputLoadError, isCreateMode, scopeId, selectedEventId]);

  useEffect(() => {
    if (scopeFieldOptionList.length === 0) {
      return;
    }
    setEventActionInputDraftList((previous) =>
      mergeScopeFieldMetadataIntoDraftList(previous, scopeFieldOptionList)
    );
    setEventActionInputBaselineList((previous) =>
      mergeScopeFieldMetadataIntoDraftList(previous, scopeFieldOptionList)
    );
  }, [scopeFieldOptionList]);

  const resolveLocationLabel = useCallback(
    (id: number | null) => (id == null ? "-" : (locationMap.get(id) ?? copy.fallbackLocation)),
    [copy.fallbackLocation, locationMap]
  );

  const resolveUnityLabel = useCallback(
    (id: number | null) => (id == null ? "-" : (unityMap.get(id) ?? copy.fallbackUnity)),
    [copy.fallbackUnity, unityMap]
  );

  const resolveItemLabel = useCallback(
    (id: number | null) => (id == null ? "-" : (itemLabelMap.get(id) ?? copy.fallbackItem)),
    [copy.fallbackItem, itemLabelMap]
  );

  const resolveActionLabel = useCallback(
    (id: number | null) => (id == null ? "-" : (actionMap.get(id) ?? copy.fallbackAction)),
    [actionMap, copy.fallbackAction]
  );

  const renderEventAsideDetailLineBlock = useCallback(
    (item: TenantScopeEventRecord, inputSummary?: string | null) =>
      [
        resolveLocationLabel(item.location_id),
        resolveItemLabel(item.item_id),
        inputSummary ?? "-"
      ].map((line, index, list) => (
        <span key={`${item.id}-aside-detail-${index}`}>
          {line}
          {index < list.length - 1 ? <br /> : null}
        </span>
      )),
    [resolveItemLabel, resolveLocationLabel]
  );

  const selectedEventInputSummary = useMemo(
    () => buildEventInputSummary(eventActionInputDraftList),
    [eventActionInputDraftList]
  );

  const eventActionInputDirty = useMemo(
    () =>
      !areEventActionInputDraftListsEqual(
        eventActionInputDraftList,
        eventActionInputBaselineList
      ),
    [eventActionInputBaselineList, eventActionInputDraftList]
  );

  const resolveEventListInputSummary = useCallback(
    (item: TenantScopeEventRecord): string | null => item.input_summary ?? null,
    []
  );

  const isDirty = useMemo(() => {
    const ageOrUnityDirty =
      ageInput.trim() !== baseline.ageInput.trim()
      || (variant === "fact" && unityId !== baseline.unityId);
    return (
      ageOrUnityDirty ||
      locationId !== baseline.locationId ||
      itemId !== baseline.itemId ||
      actionId !== baseline.actionId ||
      eventActionInputDirty ||
      isDeletePending
    );
  }, [
    actionId,
    ageInput,
    baseline.actionId,
    baseline.ageInput,
    baseline.locationId,
    baseline.itemId,
    baseline.unityId,
    eventActionInputDirty,
    isDeletePending,
    locationId,
    itemId,
    unityId,
    variant
  ]);

  const validate = useCallback(() => {
    const nextError: {
      age?: string;
      unity?: string;
      location?: string;
      item?: string;
      action?: string;
      currentAge?: string;
    } = {};

    if (parseNonNegativeInt(ageInput) == null) {
      nextError.age = copy.ageRequired;
    }
    if (variant === "fact") {
      if (unityId == null) {
        nextError.unity = copy.unityRequired;
      }
    } else if (currentAgeField == null) {
      nextError.currentAge = copy.currentAgeFieldMissing;
    }
    if (locationId == null) {
      nextError.location = copy.locationRequired;
    }
    if (itemId == null) {
      nextError.item = copy.itemRequired;
    }
    if (actionId == null) {
      nextError.action = copy.actionRequired;
    }

    setFieldError(nextError);
    return Object.keys(nextError).length === 0;
  }, [
    actionId,
    copy.actionRequired,
    copy.ageRequired,
    copy.currentAgeFieldMissing,
    copy.locationRequired,
    copy.unityRequired,
    copy.itemRequired,
    ageInput,
    currentAgeField,
    itemId,
    locationId,
    unityId,
    variant
  ]);

  const handleChangeActionInputValue = useCallback((fieldId: number, value: string) => {
    setRequestErrorMessage(null);
    setEventActionInputDraftList((previous) =>
      previous.map((item) => (item.fieldId === fieldId ? { ...item, value } : item))
    );
  }, []);

  const persistEventActionInputDraftList = useCallback(
    async (eventId: number) => {
      if (scopeId == null) {
        return;
      }

      const baselineByFieldIdMap = new Map<number, EventActionInputDraft>();
      for (const baselineItem of eventActionInputBaselineList) {
        baselineByFieldIdMap.set(baselineItem.fieldId, baselineItem);
      }

      for (const orphanServerId of eventActionInputOrphanServerIdList) {
        const deleteResponse = await fetch(
          `/api/auth/tenant/current/scopes/${scopeId}/events/${eventId}/inputs/${orphanServerId}`,
          { method: "DELETE" }
        );
        const deleteData: unknown = await deleteResponse.json().catch(() => ({}));
        if (!deleteResponse.ok) {
          throw new Error(
            parseErrorDetail(deleteData, copy.actionInputSaveError) ?? copy.actionInputSaveError
          );
        }
      }

      for (const draftItem of eventActionInputDraftList) {
        const baselineItem = baselineByFieldIdMap.get(draftItem.fieldId);
        const nextValue = draftItem.value.trim();
        const baselineValue = baselineItem?.value.trim() ?? "";
        const serverInputId = draftItem.serverInputId ?? baselineItem?.serverInputId;

        if (!serverInputId) {
          if (!nextValue) {
            continue;
          }
          const createResponse = await fetch(
            `/api/auth/tenant/current/scopes/${scopeId}/events/${eventId}/inputs`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                field_id: draftItem.fieldId,
                value: nextValue
              })
            }
          );
          const createData: unknown = await createResponse.json().catch(() => ({}));
          if (!createResponse.ok) {
            throw new Error(
              parseErrorDetail(createData, copy.actionInputSaveError) ?? copy.actionInputSaveError
            );
          }
          continue;
        }

        if (!nextValue) {
          const deleteResponse = await fetch(
            `/api/auth/tenant/current/scopes/${scopeId}/events/${eventId}/inputs/${serverInputId}`,
            { method: "DELETE" }
          );
          const deleteData: unknown = await deleteResponse.json().catch(() => ({}));
          if (!deleteResponse.ok) {
            throw new Error(
              parseErrorDetail(deleteData, copy.actionInputSaveError) ?? copy.actionInputSaveError
            );
          }
          continue;
        }

        if (nextValue === baselineValue) {
          continue;
        }

        const patchResponse = await fetch(
          `/api/auth/tenant/current/scopes/${scopeId}/events/${eventId}/inputs/${serverInputId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ value: nextValue })
          }
        );
        const patchData: unknown = await patchResponse.json().catch(() => ({}));
        if (!patchResponse.ok) {
          throw new Error(
            parseErrorDetail(patchData, copy.actionInputSaveError) ?? copy.actionInputSaveError
          );
        }
      }
    },
    [
      copy.actionInputSaveError,
      eventActionInputBaselineList,
      eventActionInputDraftList,
      eventActionInputOrphanServerIdList,
      scopeId
    ]
  );

  const refreshSavedEventActionInputState = useCallback(
    async (eventId: number) => {
      if (scopeId == null) {
        return cloneEventActionInputDraftList(eventActionInputDraftList);
      }

      try {
        const inputResponse = await fetch(
          `/api/auth/tenant/current/scopes/${scopeId}/events/${eventId}/inputs`
        );
        const inputData: unknown = await inputResponse.json().catch(() => ({}));
        if (!inputResponse.ok) {
          throw new Error(
            parseErrorDetail(inputData, copy.actionInputLoadError) ?? copy.actionInputLoadError
          );
        }

        const savedInputList = (inputData as ScopeInputListResponse).item_list;
        const savedInputByFieldIdMap = new Map<number, ScopeInputListResponse["item_list"][number]>();
        for (const input of savedInputList) {
          savedInputByFieldIdMap.set(input.field_id, input);
        }

        const nextDraftList = eventActionInputDraftList.map((draftItem) => {
          const savedInput = savedInputByFieldIdMap.get(draftItem.fieldId);
          return {
            ...draftItem,
            value: savedInput?.value ?? "",
            serverInputId: savedInput?.id
          };
        });

        const draftFieldIdSet = new Set(eventActionInputDraftList.map((item) => item.fieldId));
        const orphanServerIdList = savedInputList
          .filter((input) => !draftFieldIdSet.has(input.field_id))
          .map((input) => input.id);

        setActionInputErrorMessage(null);
        setEventActionInputDraftList(nextDraftList);
        setEventActionInputBaselineList(cloneEventActionInputDraftList(nextDraftList));
        setEventActionInputOrphanServerIdList(orphanServerIdList);

        return nextDraftList;
      } catch (error) {
        const fallbackDraftList = cloneEventActionInputDraftList(eventActionInputDraftList);
        setActionInputErrorMessage(
          error instanceof Error && error.message.trim()
            ? error.message
            : copy.actionInputLoadError
        );
        setEventActionInputBaselineList(cloneEventActionInputDraftList(fallbackDraftList));
        setEventActionInputOrphanServerIdList([]);
        return fallbackDraftList;
      }
    },
    [
      copy.actionInputLoadError,
      eventActionInputDraftList,
      scopeId
    ]
  );

  const handleStartCreate = useCallback(() => {
    if (!directory?.can_edit || isSaving) {
      return;
    }
    bumpNewIntent();
    if (!isCreateMode) {
      applySyncFromHandlers(directory, "new");
    }
  }, [applySyncFromHandlers, bumpNewIntent, directory, isCreateMode, isSaving]);

  const handleSelectEvent = useCallback(
    (item: TenantScopeEventRecord) => {
      if (!directory) {
        return;
      }
      if (!isCreateMode && item.id === selectedEvent?.id) {
        return;
      }
      applySyncFromHandlers(directory, item.id);
    },
    [applySyncFromHandlers, directory, isCreateMode, selectedEvent]
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

    const ageValue = parseNonNegativeInt(ageInput);
    if (!isDeletePending && ageValue == null) {
      setFieldError((previous) => ({ ...previous, age: copy.ageRequired }));
      return;
    }
    if (!isDeletePending && variant === "standard" && currentAgeField == null) {
      setFieldError((previous) => ({
        ...previous,
        currentAge: copy.currentAgeFieldMissing
      }));
      return;
    }

    setIsSaving(true);
    invalidateDirectoryRequestCache(
      `/api/auth/tenant/current/scopes/${scopeId}/events`
    );
    try {
      if (isCreateMode) {
        const createBody =
          variant === "fact"
            ? {
              unity_id: unityId,
              location_id: locationId,
              item_id: itemId,
              action_id: actionId,
              age: ageValue
            }
            : {
              location_id: locationId,
              item_id: itemId,
              action_id: actionId,
              age: ageValue
            };
        const response = await fetch(`/api/auth/tenant/current/scopes/${scopeId}/events`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(createBody)
        });
        const data: unknown = await response.json().catch(() => ({}));

        if (!response.ok) {
          setRequestErrorMessage(
            resolveScopeEventHttpErrorMessage(data, copy.scopeEventApiError, copy.createError)
          );
          return;
        }

        const updatedDirectory = data as TenantScopeEventDirectoryResponse;
        const previousIdSet = new Set(directory.item_list.map((item) => item.id));
        const created = updatedDirectory.item_list.find((item) => !previousIdSet.has(item.id));
        let nextDirectory = updatedDirectory;
        if (created && eventActionInputDirty) {
          await persistEventActionInputDraftList(created.id);
          nextDirectory = updateEventDirectoryInputSummary(
            updatedDirectory,
            created.id,
            selectedEventInputSummary
          );
        }
        bumpNewIntent();
        applySyncFromHandlers(nextDirectory, "new");
        setHistoryRefreshKey((previous) => previous + 1);
        return;
      }

      if (!selectedEvent) {
        return;
      }

      const patchBody =
        variant === "fact"
          ? {
            unity_id: unityId,
            location_id: locationId,
            item_id: itemId,
            action_id: actionId,
            age: ageValue
          }
          : {
            location_id: locationId,
            item_id: itemId,
            action_id: actionId,
            unity_id: null,
            age: ageValue
          };
      const response = await fetch(
        `/api/auth/tenant/current/scopes/${scopeId}/events/${selectedEvent.id}`,
        isDeletePending
          ? { method: "DELETE" }
          : {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patchBody)
          }
      );
      const data: unknown = await response.json().catch(() => ({}));

      if (!response.ok) {
        const fallback = isDeletePending ? copy.deleteError : copy.saveError;
        const detail = resolveScopeEventHttpErrorMessage(
          data,
          copy.scopeEventApiError,
          fallback
        );
        if (isDeletePending && isDeleteBlockedDetail(detail)) {
          setRequestErrorMessage(copy.deleteBlockedDetail);
          return;
        }
        setRequestErrorMessage(detail);
        return;
      }

      const updatedDirectory = data as TenantScopeEventDirectoryResponse;
      if (isDeletePending) {
        const nextKey: EventSelectionKey = updatedDirectory.can_edit ? "new" : null;
        applySyncFromHandlers(updatedDirectory, nextKey);
      } else {
        let nextDirectory = updatedDirectory;
        if (eventActionInputDirty) {
          await persistEventActionInputDraftList(selectedEvent.id);
          const refreshedDraftList = await refreshSavedEventActionInputState(selectedEvent.id);
          nextDirectory = updateEventDirectoryInputSummary(
            updatedDirectory,
            selectedEvent.id,
            buildEventInputSummary(refreshedDraftList)
          );
        } else {
          setEventActionInputBaselineList(cloneEventActionInputDraftList(eventActionInputDraftList));
        }
        bumpNewIntent();
        applySyncFromHandlers(
          nextDirectory,
          preferredSelectionKeyAfterEditSave(updatedDirectory.can_edit, selectedEvent.id)
        );
      }
      setHistoryRefreshKey((previous) => previous + 1);
    } catch (error) {
      if (error instanceof Error && error.message.trim()) {
        setRequestErrorMessage(error.message);
      } else {
        setRequestErrorMessage(
          isCreateMode
            ? copy.createError
            : isDeletePending
              ? copy.deleteError
              : copy.saveError
        );
      }
    } finally {
      setIsSaving(false);
    }
  }, [
    actionId,
    applySyncFromHandlers,
    bumpNewIntent,
    copy.createError,
    copy.deleteBlockedDetail,
    copy.deleteError,
    copy.ageRequired,
    copy.currentAgeFieldMissing,
    copy.saveError,
    currentAgeField,
    directory,
    isCreateMode,
    isDeletePending,
    eventActionInputDraftList,
    eventActionInputDirty,
    locationId,
    ageInput,
    scopeId,
    selectedEvent,
    selectedEventInputSummary,
    persistEventActionInputDraftList,
    refreshSavedEventActionInputState,
    itemId,
    unityId,
    validate,
    variant
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
    fieldError.age ??
    fieldError.unity ??
    fieldError.currentAge ??
    fieldError.location ??
    fieldError.item ??
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
      filter={
        directory
          ? {
            panel: (
              <EventFilterPanel
                locale={locale}
                showAgeRange
                copy={{
                  ageFromLabel: copy.filterAgeFromLabel,
                  ageToLabel: copy.filterAgeToLabel,
                  locationLabel: copy.filterLocationLabel,
                  itemLabel: copy.filterItemLabel,
                  actionLabel: copy.filterActionLabel,
                  allLabel: copy.filterAll,
                  allAriaLabel: copy.filterAllAria,
                  confirmLabel: copy.filterConfirm
                }}
                filterAgeFromInput={filterAgeFromInput}
                filterAgeToInput={filterAgeToInput}
                filterLocationIdList={filterLocationIdList}
                filterItemIdList={filterItemIdList}
                filterActionId={filterActionId}
                locationItemList={initialLocationDirectory?.item_list ?? []}
                itemHierarchyList={initialItemDirectory?.item_list ?? []}
                actionOptionList={actionOptionList}
                onFilterAgeFromChange={setFilterAgeFromInput}
                onFilterAgeToChange={setFilterAgeToInput}
                onFilterLocationChange={setFilterLocationIdList}
                onFilterItemChange={setFilterItemIdList}
                onFilterActionChange={(value) => {
                  setFilterActionId(parseNumericFilter(value));
                }}
              />
            ),
            storageSegment: variant === "fact" ? "event-fact" : "event-standard"
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
            <div className="ui-notice-attention ui-notice-block">
              {copy.readOnlyNotice}
            </div>
          ) : null}

          <div className="ui-directory-list">
            <ConfigurationDirectoryListToolbarRow
              showFilterToggle={directory != null}
              filterSegment={variant === "fact" ? "event-fact" : "event-standard"}
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
                <div className="ui-directory-event-head">
                  <div className="ui-directory-title-row">
                    <p className="ui-directory-title ui-directory-title-emphasis">
                      {resolveActionLabel(item.action_id)}
                    </p>
                    <p className="ui-directory-date">{String(item.age)}</p>
                  </div>
                  {variant === "fact" && item.unity_id != null ? (
                    <p className="ui-directory-title ui-directory-title-emphasis">
                      {resolveUnityLabel(item.unity_id)}
                    </p>
                  ) : null}
                </div>
                <p className="ui-directory-caption-wrap">
                  {renderEventAsideDetailLineBlock(
                    item,
                    resolveEventListInputSummary(item)
                  )}
                </p>
              </button>
            ))}
          </div>
        </>
      }
      editorForm={
        directory ? (
          <>
            {variant === "fact" ? (
              <section className="ui-card ui-form-section ui-border-accent">
                <EditorPanelFlashOverlay active={isEditorFlashActive} />
                <div className="ui-field">
                  <label className="ui-field-label" htmlFor="event-unity">
                    {copy.unityLabel}
                  </label>
                  <select
                    id="event-unity"
                    className="ui-input ui-input-select"
                    value={unityId == null ? "" : String(unityId)}
                    aria-invalid={Boolean(fieldError.unity)}
                    onChange={(event) => {
                      const raw = event.target.value;
                      const nextUnityId = raw === "" ? null : parseNumericFilter(raw);
                      setUnityId(nextUnityId);
                      setFieldError((prev) => ({ ...prev, unity: undefined }));
                      if (nextUnityId != null) {
                        const record = unityRecordById.get(nextUnityId);
                        if (record) {
                          setLocationId(record.location_id);
                          setFieldError((prev) => ({ ...prev, location: undefined }));
                          if (itemId != null && !record.item_id_list.includes(itemId)) {
                            setItemId(null);
                          }
                        }
                      }
                      setRequestErrorMessage(null);
                    }}
                    disabled={isDeletePending || !canEditForm}
                  >
                    <option value="" aria-label={copy.filterAllAria}></option>
                    {unityOptionList.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  <p className="ui-field-hint">{copy.unityHint}</p>
                </div>
              </section>
            ) : null}

            <section className="ui-card ui-form-section ui-border-accent">
              {variant === "standard" ? (
                <EditorPanelFlashOverlay active={isEditorFlashActive} />
              ) : null}
              <HierarchySingleSelectField
                id="event-location"
                label={copy.locationLabel}
                itemList={filteredLocationItemList}
                primaryField
                value={locationId}
                onChange={(nextValue) => {
                  setLocationId(nextValue);
                  setFieldError((previous) => ({ ...previous, location: undefined }));
                  setRequestErrorMessage(null);
                }}
                getParentId={(item) => item.parent_location_id ?? null}
                allLabel={copy.filterAll}
                disabled={isDeletePending || !canEditForm || selectedUnityRecord != null}
                ariaInvalid={Boolean(fieldError.location)}
              />
              <p className="ui-field-hint">{copy.locationHint}</p>
            </section>

            <section className="ui-card ui-form-section ui-border-accent">
              <HierarchySingleSelectField
                id="event-item"
                label={copy.itemLabel}
                itemList={filteredItemItemList}
                value={itemId}
                onChange={(nextValue) => {
                  setItemId(nextValue);
                  setFieldError((previous) => ({ ...previous, item: undefined }));
                  setRequestErrorMessage(null);
                }}
                getParentId={(row) => row.parent_item_id ?? null}
                allLabel={copy.filterAll}
                disabled={isDeletePending || !canEditForm}
                ariaInvalid={Boolean(fieldError.item)}
              />
              <p className="ui-field-hint">{copy.itemHint}</p>
            </section>

            <section className="ui-card ui-form-section ui-border-accent">
              <EventActionField
                copy={{
                  actionLabel: copy.actionLabel,
                  actionHint: copy.actionHint,
                  actionEmptyAriaLabel: copy.filterAllAria,
                  inputSectionTitle: copy.actionInputSectionTitle,
                  inputSectionHint: copy.actionInputSectionHint,
                  inputLoadingAriaLabel: copy.actionInputLoadingAriaLabel
                }}
                actionId={actionId}
                actionOptionList={actionOptionList}
                onChangeActionId={(value) => {
                  setActionId(parseNumericFilter(value));
                  setFieldError((previous) => ({ ...previous, action: undefined }));
                  setRequestErrorMessage(null);
                }}
                actionErrorMessage={fieldError.action}
                disabled={isDeletePending || !canEditForm}
                embedded
                showInputSection={false}
                generatedInputFieldList={eventActionInputDraftList.map((item) => ({
                  fieldId: item.fieldId,
                  label: item.label,
                  sqlType: item.sqlType,
                  value: item.value
                }))}
                inputLoading={actionInputLoading}
                inputErrorMessage={actionInputErrorMessage}
                onChangeInputValue={handleChangeActionInputValue}
              />

              <div className="ui-field">
                <label className="ui-field-label" htmlFor="event-age">
                  {copy.ageLabel}
                </label>
                <input
                  id="event-age"
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  className="ui-input"
                  value={ageInput}
                  onChange={(event) => {
                    setAgeInput(event.target.value);
                    setFieldError((previous) => ({ ...previous, age: undefined }));
                    setRequestErrorMessage(null);
                  }}
                  disabled={isDeletePending || !canEditForm}
                  aria-invalid={Boolean(fieldError.age)}
                />
                <p className="ui-field-hint">{copy.ageHint}</p>
              </div>
            </section>

            {actionId != null
            && (actionInputLoading
              || Boolean(actionInputErrorMessage)
              || eventActionInputDraftList.length > 0) ? (
              <section className="ui-card ui-form-section ui-border-accent">
                <EventActionField
                  copy={{
                    actionLabel: copy.actionLabel,
                    actionHint: copy.actionHint,
                    actionEmptyAriaLabel: copy.filterAllAria,
                    inputSectionTitle: copy.actionInputSectionTitle,
                    inputSectionHint: copy.actionInputSectionHint,
                    inputLoadingAriaLabel: copy.actionInputLoadingAriaLabel
                  }}
                  actionId={actionId}
                  actionOptionList={actionOptionList}
                  onChangeActionId={(value) => {
                    setActionId(parseNumericFilter(value));
                    setFieldError((previous) => ({ ...previous, action: undefined }));
                    setRequestErrorMessage(null);
                  }}
                  actionErrorMessage={fieldError.action}
                  disabled={isDeletePending || !canEditForm}
                  embedded
                  showActionSection={false}
                  generatedInputFieldList={eventActionInputDraftList.map((item) => ({
                    fieldId: item.fieldId,
                    label: item.label,
                    sqlType: item.sqlType,
                    value: item.value
                  }))}
                  inputLoading={actionInputLoading}
                  inputErrorMessage={actionInputErrorMessage}
                  onChangeInputValue={handleChangeActionInputValue}
                />
              </section>
            ) : null}

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
