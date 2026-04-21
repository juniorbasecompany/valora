"use client";

import dynamic from "next/dynamic";
import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode
} from "react";
import { createPortal } from "react-dom";

import { PageHeader } from "@/component/app-shell/page-header";
import type { FormulaFieldOption } from "@/component/configuration/formula-statement-editor";

const FormulaStatementEditor = dynamic(
  () =>
    import("@/component/configuration/formula-statement-editor").then(
      (mod) => mod.FormulaStatementEditor
    ),
  { ssr: false }
);
import {
  DirectoryFilterCard,
  DirectoryFilterPanel
} from "@/component/configuration/directory-filter-panel";
import { ConfigurationEditorFooter } from "@/component/configuration/configuration-editor-footer";
import { ConfigurationPanelVisibilitySwitch } from "@/component/configuration/configuration-panel-visibility-switch";
import { HierarchySingleSelectField } from "@/component/configuration/hierarchy-dropdown-field";
import { StatusPanel } from "@/component/app-shell/status-panel";
import type {
  ScopeCurrentAgeCalculationEmptyReason,
  ScopeFormulaRecord,
  ScopeCurrentAgeCalculationRecord,
  ScopeCurrentAgeCalculationResponse,
  ScopeInputListResponse,
  ScopeInputRecord,
  TenantItemDirectoryResponse,
  TenantLocationDirectoryResponse,
  TenantScopeActionDirectoryResponse,
  TenantScopeFieldDirectoryResponse,
  TenantScopeFieldRecord,
  TenantScopeRecord,
  TenantUnityDirectoryResponse,
  TenantUnityRecord
} from "@/lib/auth/types";
import { parseErrorDetail } from "@/lib/api/parse-error-detail";
import {
  filterItemListByUnity,
  filterLocationListByUnity
} from "@/lib/configuration/unity-hierarchy-filter";

const UI_TEXT_SEPARATOR = "\u00A0\u00A0●\u00A0\u00A0";

type CurrentAgeCalculationCopy = {
  title: string;
  description: string;
  statusReadyTitle: string;
  statusReadyDescription: string;
  statusMissingTitle: string;
  statusMissingDescription: string;
  emptyScope: string;
  missingCurrentScope: string;
  readOnlyNotice: string;
  unityLabel: string;
  unityHint: string;
  filterAllAria: string;
  locationLabel: string;
  locationHint: string;
  itemLabel: string;
  itemHint: string;
  read: string;
  reading: string;
  calculate: string;
  calculating: string;
  delete: string;
  deleting: string;
  calculateError: string;
  calculateErrorMissingFormulaInput: string;
  deleteError: string;
  resultEmptyDefault: string;
  resultEmptyNoEventsInScope: string;
  resultEmptyNoEligibleWindow: string;
  resultEmptyNoResultsAfterCalculation: string;
  resultEmptyNoPersistedResults: string;
  resultEmptyNoResultsToDelete: string;
  resultAgeLabel: string;
  actionLabel: string;
  formulaLabel: string;
  emptyValue: string;
  fallbackAction: string;
  detailedViewLabel: string;
  detailedViewAriaLabel: string;
  cancel: string;
  discardConfirm: string;
  resultTableBusyAriaLabel: string;
  inputEditSaving: string;
  inputEditRequiredError: string;
  inputEditSaveError: string;
  inputEditOkButton: string;
  formulaStatementAriaLabel: string;
  formulaUnknownFieldLabel: string;
  formulaStatementRequiredError: string;
  formulaSaveError: string;
};

type CurrentAgeCalculationClientProps = {
  locale: string;
  currentScope: TenantScopeRecord | null;
  hasAnyScope: boolean;
  initialFieldDirectory: TenantScopeFieldDirectoryResponse | null;
  initialLocationDirectory: TenantLocationDirectoryResponse | null;
  initialItemDirectory: TenantItemDirectoryResponse | null;
  initialUnityDirectory: TenantUnityDirectoryResponse | null;
  initialActionDirectory: TenantScopeActionDirectoryResponse | null;
  initialFormulaList: ScopeFormulaRecord[];
  copy: CurrentAgeCalculationCopy;
};

function formatPersistedValue(
  item: ScopeCurrentAgeCalculationRecord,
  emptyValueLabel: string,
  fieldType?: string
) {
  if (item.text_value != null && item.text_value.trim()) {
    return item.text_value;
  }
  if (item.boolean_value != null) {
    return item.boolean_value ? "true" : "false";
  }
  if (item.numeric_value != null) {
    return formatNumericValueForFieldType(item.numeric_value, fieldType);
  }
  return emptyValueLabel;
}

function normalizeSqlType(sqlType?: string) {
  return sqlType?.trim().toUpperCase().replace(/\s+/g, " ") ?? "";
}

function extractNumericScale(sqlType?: string) {
  const normalized = normalizeSqlType(sqlType);
  const match = normalized.match(/^(?:NUMERIC|DECIMAL)\(\s*\d+\s*,\s*(\d+)\s*\)$/);
  if (!match) {
    return null;
  }
  return Number(match[1]);
}

function isIntegerSqlType(sqlType?: string) {
  const normalized = normalizeSqlType(sqlType);
  return ["INTEGER", "INT", "BIGINT", "SMALLINT"].includes(normalized);
}

/** Formata número finito em decimal fixo, sem notação científica (ex.: 1e-10, 0E-10). */
function formatFiniteNumberPlain(n: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "standard",
    useGrouping: false,
    maximumFractionDigits: 20,
  }).format(n);
}

/** Converte valor numérico da API para texto sem exponencial; preserva string não numérica. */
function numericValueToPlainString(value: number | string): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") {
      return value;
    }
    const n = Number(trimmed);
    if (!Number.isFinite(n)) {
      return value;
    }
    return formatFiniteNumberPlain(n);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return String(value);
    }
    return formatFiniteNumberPlain(value);
  }
  return String(value);
}

function formatDecimalString(valueText: string, scale: number) {
  const normalized = valueText.trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) {
    return normalized;
  }

  const isNegative = normalized.startsWith("-");
  const unsignedValue = isNegative ? normalized.slice(1) : normalized;
  const [integerPart, decimalPart = ""] = unsignedValue.split(".");
  const paddedDecimalPart = decimalPart.padEnd(scale, "0").slice(0, scale);
  const signedIntegerPart = `${isNegative ? "-" : ""}${integerPart}`;

  if (scale === 0) {
    return signedIntegerPart;
  }

  return `${signedIntegerPart}.${paddedDecimalPart}`;
}

function formatNumericValueForFieldType(value: number | string, fieldType?: string) {
  const valueText = numericValueToPlainString(value);
  if (isIntegerSqlType(fieldType)) {
    return formatDecimalString(valueText, 0);
  }

  const scale = extractNumericScale(fieldType);
  if (scale != null) {
    return formatDecimalString(valueText, scale);
  }

  return valueText;
}

const FORMULA_REFERENCE_TOKEN = /\$\{(field|input):(\d+)\}/g;
const FORMULA_INPUT_TOKEN = /\$\{input:\d+\}/;

function formulaHasInputToken(statement: string | undefined): boolean {
  return statement != null && FORMULA_INPUT_TOKEN.test(statement);
}

function formatFormulaStatement(
  statement: string,
  fieldLabelById: Map<number, string>
) {
  return statement.replace(FORMULA_REFERENCE_TOKEN, (_full, _kind: string, idText: string) => {
    const id = Number(idText);
    return fieldLabelById.get(id) ?? `#${id}`;
  });
}

function renderFormulaStatementInline(
  statement: string,
  fieldLabelById: Map<number, string>
): ReactNode[] {
  const nodeList: ReactNode[] = [];
  let lastIndex = 0;
  let tokenIndex = 0;
  for (const match of statement.matchAll(FORMULA_REFERENCE_TOKEN)) {
    const fullMatch = match[0];
    const referenceKind = match[1] === "input" ? "input" : "field";
    const id = Number(match[2]);
    const matchIndex = match.index ?? 0;
    if (matchIndex > lastIndex) {
      nodeList.push(statement.slice(lastIndex, matchIndex));
    }
    nodeList.push(
      <span
        key={`${referenceKind}-${id}-${tokenIndex}`}
        className={referenceKind === "input"
          ? "ui-formula-field-token ui-formula-input-token"
          : "ui-formula-field-token"}
      >
        {fieldLabelById.get(id) ?? `#${id}`}
      </span>
    );
    lastIndex = matchIndex + fullMatch.length;
    tokenIndex += 1;
  }
  if (lastIndex < statement.length) {
    nodeList.push(statement.slice(lastIndex));
  }
  return nodeList;
}

function renderTemplateWithSlots(
  template: string,
  slotByName: Record<string, ReactNode>
): ReactNode[] {
  const nodeList: ReactNode[] = [];
  let lastIndex = 0;
  let tokenIndex = 0;
  const tokenRegex = /\{([a-zA-Z0-9_]+)\}/g;
  for (const match of template.matchAll(tokenRegex)) {
    const matchIndex = match.index ?? 0;
    if (matchIndex > lastIndex) {
      nodeList.push(template.slice(lastIndex, matchIndex));
    }
    const slotName = match[1];
    nodeList.push(
      <Fragment key={`${slotName}-${tokenIndex}`}>
        {slotByName[slotName] ?? match[0]}
      </Fragment>
    );
    lastIndex = matchIndex + match[0].length;
    tokenIndex += 1;
  }
  if (lastIndex < template.length) {
    nodeList.push(template.slice(lastIndex));
  }
  return nodeList;
}

function resolveEmptyResultMessage(
  emptyReason: ScopeCurrentAgeCalculationEmptyReason | null | undefined,
  copy: CurrentAgeCalculationCopy
) {
  switch (emptyReason) {
    case "no_events_in_scope":
      return copy.resultEmptyNoEventsInScope;
    case "no_eligible_window":
      return copy.resultEmptyNoEligibleWindow;
    case "no_results_after_calculation":
      return copy.resultEmptyNoResultsAfterCalculation;
    case "no_persisted_results":
      return copy.resultEmptyNoPersistedResults;
    case "no_results_to_delete":
      return copy.resultEmptyNoResultsToDelete;
    default:
      return copy.resultEmptyDefault;
  }
}

function parseDetailObject(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const detail = (payload as { detail?: unknown }).detail;
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) {
    return null;
  }
  return detail as Record<string, unknown>;
}

function resolveCurrentAgeRequestErrorMessage(
  payload: unknown,
  fallback: string,
  copy: CurrentAgeCalculationCopy,
  actionLabelById: Map<number, string>,
  formulaStatementById: Map<number, string>,
  formulaRawStatementById: Map<number, string>,
  fieldLabelById: Map<number, string>
): ReactNode {
  const detail = parseDetailObject(payload);
  const code = typeof detail?.code === "string" ? detail.code : null;
  if (code === "current_age_formula_input_missing") {
    const actionId = Number(detail?.action_id);
    const formulaId = Number(detail?.formula_id);
    const fieldId = Number(detail?.field_id);
    const eventLabel = actionLabelById.get(actionId) ?? `#${detail?.event_id ?? ""}`;
    const formulaRawStatement = formulaRawStatementById.get(formulaId);
    const formulaLabel = formulaRawStatement != null
      ? renderFormulaStatementInline(formulaRawStatement, fieldLabelById)
      : (formulaStatementById.get(formulaId) ?? `#${detail?.formula_id ?? ""}`);
    const fieldLabel = fieldLabelById.get(fieldId) ?? `#${detail?.field_id ?? ""}`;
    return renderTemplateWithSlots(copy.calculateErrorMissingFormulaInput, {
      eventLabel,
      formulaLabel,
      fieldLabel: (
        <span className="ui-formula-field-token ui-formula-input-token">
          {fieldLabel}
        </span>
      )
    });
  }

  return parseErrorDetail(payload, fallback) ?? fallback;
}

function parsePositiveIntOrNull(raw: string): number | null {
  if (!raw) {
    return null;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return null;
  }
  return parsed;
}

export function CurrentAgeCalculationClient({
  locale,
  currentScope,
  hasAnyScope,
  initialFieldDirectory,
  initialLocationDirectory,
  initialItemDirectory,
  initialUnityDirectory,
  initialActionDirectory,
  initialFormulaList,
  copy
}: CurrentAgeCalculationClientProps) {
  const [footerPortalTarget, setFooterPortalTarget] = useState<HTMLElement | null>(null);
  const [unityId, setUnityId] = useState<number | null>(null);
  const [locationId, setLocationId] = useState<number | null>(null);
  const [itemId, setItemId] = useState<number | null>(null);
  const [footerErrorMessage, setFooterErrorMessage] = useState<string | null>(null);
  const [requestErrorMessage, setRequestErrorMessage] = useState<ReactNode | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [result, setResult] = useState<ScopeCurrentAgeCalculationResponse | null>(null);
  const [isGroupedView, setIsGroupedView] = useState(true);
  const [activeDropdown, setActiveDropdown] = useState<{
    resultId: number;
    anchorTop: number;
    anchorBottom: number;
    left: number;
  } | null>(null);
  const [dropdownPlacement, setDropdownPlacement] = useState<{
    top: number;
    maxHeight: number | null;
  } | null>(null);
  const dropdownPanelRef = useRef<HTMLDivElement | null>(null);
  const [inputListByEventId, setInputListByEventId] = useState<
    Record<number, ScopeInputRecord[]>
  >({});
  const fetchedEventIdSetRef = useRef<Set<number>>(new Set());
  const [editingInputValueByFieldId, setEditingInputValueByFieldId] = useState<
    Record<number, string>
  >({});
  const [isSavingInput, setIsSavingInput] = useState(false);
  const [inputSaveError, setInputSaveError] = useState<ReactNode | null>(null);
  const [formulaStatementByFormulaIdState, setFormulaStatementByFormulaIdState] = useState<
    Record<number, string>
  >(() => {
    const map: Record<number, string> = {};
    for (const formula of initialFormulaList) {
      map[formula.id] = formula.statement;
    }
    return map;
  });
  const [editingFormulaStatementByFormulaId, setEditingFormulaStatementByFormulaId] = useState<
    Record<number, string>
  >({});

  const initialField = useMemo(
    () => initialFieldDirectory?.item_list.find((item) => item.is_initial_age) ?? null,
    [initialFieldDirectory?.item_list]
  );
  const currentField = useMemo(
    () => initialFieldDirectory?.item_list.find((item) => item.is_current_age) ?? null,
    [initialFieldDirectory?.item_list]
  );
  const finalField = useMemo(
    () => initialFieldDirectory?.item_list.find((item) => item.is_final_age) ?? null,
    [initialFieldDirectory?.item_list]
  );

  const canEdit = initialFieldDirectory?.can_edit ?? false;
  const isReady = initialField != null && currentField != null && finalField != null;

  const actionLabelById = useMemo(() => {
    const map = new Map<number, string>();
    for (const item of initialActionDirectory?.item_list ?? []) {
      map.set(item.id, item.label_name?.trim() || `#${item.id}`);
    }
    return map;
  }, [initialActionDirectory?.item_list]);

  const actionOrderById = useMemo(() => {
    const map = new Map<number, number>();
    for (const [index, item] of (initialActionDirectory?.item_list ?? []).entries()) {
      map.set(item.id, index);
    }
    return map;
  }, [initialActionDirectory?.item_list]);

  const fieldLabelById = useMemo(() => {
    const map = new Map<number, string>();
    for (const item of initialFieldDirectory?.item_list ?? []) {
      map.set(item.id, item.label_name?.trim() || `#${item.id}`);
    }
    return map;
  }, [initialFieldDirectory?.item_list]);

  const fieldOptionList = useMemo<FormulaFieldOption[]>(
    () =>
      (initialFieldDirectory?.item_list ?? []).map((item) => ({
        id: item.id,
        labelName: item.label_name ?? ""
      })),
    [initialFieldDirectory?.item_list]
  );

  const fieldRecordById = useMemo(() => {
    const map = new Map<number, TenantScopeFieldRecord>();
    for (const item of initialFieldDirectory?.item_list ?? []) {
      map.set(item.id, item);
    }
    return map;
  }, [initialFieldDirectory?.item_list]);

  const locationLabelById = useMemo(() => {
    const map = new Map<number, string>();
    for (const item of initialLocationDirectory?.item_list ?? []) {
      const label = item.path_labels.length > 0
        ? item.path_labels.join(UI_TEXT_SEPARATOR)
        : item.name.trim() || `#${item.id}`;
      map.set(item.id, label);
    }
    return map;
  }, [initialLocationDirectory?.item_list]);

  const itemLabelById = useMemo(() => {
    const map = new Map<number, string>();
    for (const item of initialItemDirectory?.item_list ?? []) {
      const label = item.path_labels.length > 0
        ? item.path_labels.join(UI_TEXT_SEPARATOR)
        : item.name.trim() || `#${item.id}`;
      map.set(item.id, label);
    }
    return map;
  }, [initialItemDirectory?.item_list]);

  const formulaStatementById = useMemo(() => {
    const map = new Map<number, string>();
    for (const formula of initialFormulaList) {
      const statement = formulaStatementByFormulaIdState[formula.id] ?? formula.statement;
      map.set(formula.id, formatFormulaStatement(statement, fieldLabelById));
    }
    return map;
  }, [fieldLabelById, formulaStatementByFormulaIdState, initialFormulaList]);

  const formulaRawStatementById = useMemo(() => {
    const map = new Map<number, string>();
    for (const formula of initialFormulaList) {
      map.set(formula.id, formulaStatementByFormulaIdState[formula.id] ?? formula.statement);
    }
    return map;
  }, [formulaStatementByFormulaIdState, initialFormulaList]);

  const fieldSortOrderById = useMemo(() => {
    const map = new Map<number, number>();
    for (const [index, item] of (initialFieldDirectory?.item_list ?? []).entries()) {
      map.set(item.id, index);
    }
    return map;
  }, [initialFieldDirectory?.item_list]);
  const fieldList = initialFieldDirectory?.item_list ?? [];

  const unityOptionList = useMemo(
    () =>
      (initialUnityDirectory?.item_list ?? []).map((row) => ({
        id: row.id,
        label: row.name.trim() || `#${row.id}`
      })),
    [initialUnityDirectory?.item_list]
  );

  const unityRecordById = useMemo(() => {
    const map = new Map<number, TenantUnityRecord>();
    for (const row of initialUnityDirectory?.item_list ?? []) {
      map.set(row.id, row);
    }
    return map;
  }, [initialUnityDirectory?.item_list]);

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

  const resultRowList = useMemo<ScopeCurrentAgeCalculationRecord[]>(() => {
    if (!result) {
      return [];
    }
    return [...result.item_list].sort((left, right) => (
      left.result_age - right.result_age
      || (actionOrderById.get(left.action_id) ?? Number.MAX_SAFE_INTEGER)
        - (actionOrderById.get(right.action_id) ?? Number.MAX_SAFE_INTEGER)
      || left.formula_order - right.formula_order
      || left.location_id - right.location_id
      || left.item_id - right.item_id
      || left.event_id - right.event_id
      || left.formula_id - right.formula_id
      || (fieldSortOrderById.get(left.field_id) ?? Number.MAX_SAFE_INTEGER)
        - (fieldSortOrderById.get(right.field_id) ?? Number.MAX_SAFE_INTEGER)
      || left.result_id - right.result_id
    ));
  }, [actionOrderById, fieldSortOrderById, result]);

  const executionRowList = useMemo<ScopeCurrentAgeCalculationRecord[]>(() => {
    if (!result) {
      return [];
    }
    return result.item_list;
  }, [result]);

  const dayRowList = useMemo(() => {
    const dayByAge = new Map<number, {
      resultAge: number;
      recordByFieldId: Map<number, ScopeCurrentAgeCalculationRecord>;
    }>();

    for (const item of resultRowList) {
      let dayRow = dayByAge.get(item.result_age);
      if (!dayRow) {
        dayRow = {
          resultAge: item.result_age,
          recordByFieldId: new Map<number, ScopeCurrentAgeCalculationRecord>()
        };
        dayByAge.set(item.result_age, dayRow);
      }
      const existingRecord = dayRow.recordByFieldId.get(item.field_id);
      if (existingRecord == null || item.result_id > existingRecord.result_id) {
        dayRow.recordByFieldId.set(item.field_id, item);
      }
    }

    return [...dayByAge.values()].sort((left, right) => left.resultAge - right.resultAge);
  }, [resultRowList]);

  const emptyResultMessage = useMemo(() => (
    resolveEmptyResultMessage(result?.empty_reason, copy)
  ), [copy, result?.empty_reason]);
  const asideEmptyMessage = !currentScope
    ? hasAnyScope
      ? copy.missingCurrentScope
      : copy.emptyScope
    : null;

  const showResultBusy =
    !requestErrorMessage && (isReading || isCalculating || isDeleting);

  const footerNoticeMessage = useMemo(() => {
    if (showResultBusy) {
      return copy.resultTableBusyAriaLabel;
    }
    if (result != null && result.item_list.length === 0) {
      return emptyResultMessage;
    }
    return null;
  }, [copy.resultTableBusyAriaLabel, emptyResultMessage, result, showResultBusy]);

  /** Erros de API (cálculo, leitura, etc.): sempre no footer. */
  const combinedFooterError: ReactNode | null =
    requestErrorMessage ?? footerErrorMessage ?? null;

  const configurationPath = `/${locale}/app`;

  useEffect(() => {
    setFooterPortalTarget(document.getElementById("app-shell-footer-slot"));
  }, []);

  useEffect(() => {
    if (isSavingInput) {
      return;
    }
    setActiveDropdown(null);
  }, [result, unityId, locationId, itemId, isSavingInput]);

  useEffect(() => {
    if (activeDropdown == null) {
      return undefined;
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      if (target.closest("[data-current-age-dropdown-anchor]")) {
        return;
      }
      if (target.closest("[data-current-age-dropdown-panel]")) {
        return;
      }
      if (isSavingInput) {
        return;
      }
      setActiveDropdown(null);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSavingInput) {
        setActiveDropdown(null);
      }
    }

    function handleViewportChange() {
      if (isSavingInput) {
        return;
      }
      setActiveDropdown(null);
    }

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [activeDropdown, isSavingInput]);

  useEffect(() => {
    setEditingInputValueByFieldId({});
    setEditingFormulaStatementByFormulaId({});
    setInputSaveError(null);
  }, [activeDropdown?.resultId]);

  useLayoutEffect(() => {
    if (!activeDropdown) {
      return;
    }
    const panel = dropdownPanelRef.current;
    if (!panel) {
      return;
    }

    function recomputePlacement() {
      if (!activeDropdown || !panel) {
        return;
      }
      const viewportPadding = 12;
      const anchorOffset = 6;
      const viewportHeight = window.innerHeight;
      const panelHeight = panel.offsetHeight;

      const spaceBelow =
        viewportHeight - activeDropdown.anchorBottom - viewportPadding;
      const spaceAbove = activeDropdown.anchorTop - viewportPadding;

      let nextTop: number;
      let nextMaxHeight: number | null = null;

      if (panelHeight + anchorOffset <= spaceBelow) {
        nextTop = activeDropdown.anchorBottom + anchorOffset;
      } else if (panelHeight + anchorOffset <= spaceAbove) {
        nextTop = activeDropdown.anchorTop - panelHeight - anchorOffset;
      } else if (spaceBelow >= spaceAbove) {
        nextTop = activeDropdown.anchorBottom + anchorOffset;
        nextMaxHeight = Math.max(spaceBelow - anchorOffset, viewportPadding);
      } else {
        nextMaxHeight = Math.max(spaceAbove - anchorOffset, viewportPadding);
        nextTop = activeDropdown.anchorTop - nextMaxHeight - anchorOffset;
      }

      setDropdownPlacement((prev) => {
        if (prev && prev.top === nextTop && prev.maxHeight === nextMaxHeight) {
          return prev;
        }
        return { top: nextTop, maxHeight: nextMaxHeight };
      });
    }

    recomputePlacement();

    const observer = new ResizeObserver(() => {
      recomputePlacement();
    });
    observer.observe(panel);
    return () => {
      observer.disconnect();
    };
  }, [activeDropdown]);

  useEffect(() => {
    if (activeDropdown == null || !currentScope) {
      return;
    }
    const item = resultRowList.find(
      (entry) => entry.result_id === activeDropdown.resultId
    );
    if (!item) {
      return;
    }
    const statement = formulaRawStatementById.get(item.formula_id);
    if (!formulaHasInputToken(statement)) {
      return;
    }
    const eventId = item.event_id;
    if (fetchedEventIdSetRef.current.has(eventId)) {
      return;
    }

    let cancelled = false;
    fetchedEventIdSetRef.current.add(eventId);

    void (async () => {
      try {
        const response = await fetch(
          `/api/auth/tenant/current/scopes/${currentScope.id}/events/${eventId}/inputs`,
          { method: "GET" }
        );
        if (!response.ok) {
          fetchedEventIdSetRef.current.delete(eventId);
          return;
        }
        const data = (await response.json()) as ScopeInputListResponse;
        if (cancelled) {
          return;
        }
        setInputListByEventId((prev) => ({
          ...prev,
          [eventId]: data.item_list
        }));
      } catch {
        fetchedEventIdSetRef.current.delete(eventId);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeDropdown, currentScope, formulaRawStatementById, resultRowList]);

  function validateRequest() {
    if (!currentScope || !canEdit || !isReady) {
      return false;
    }
    return true;
  }

  async function handleRead() {
    if (!validateRequest() || !currentScope) {
      return;
    }

    setIsReading(true);
    setRequestErrorMessage(null);
    setFooterErrorMessage(null);

    try {
      const response = await fetch(
        `/api/auth/tenant/current/scopes/${currentScope.id}/events/read-current-age`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            unity_id: unityId,
            location_id: locationId,
            item_id: itemId
          })
        }
      );
      const data: unknown = await response.json().catch(() => ({}));

      if (!response.ok) {
        setRequestErrorMessage(
          resolveCurrentAgeRequestErrorMessage(
            data,
            copy.calculateError,
            copy,
            actionLabelById,
            formulaStatementById,
            formulaRawStatementById,
            fieldLabelById
          )
        );
        return;
      }

      setResult(data as ScopeCurrentAgeCalculationResponse);
    } catch (error) {
      setRequestErrorMessage(
        error instanceof Error && error.message.trim()
          ? error.message
          : copy.calculateError
      );
    } finally {
      setIsReading(false);
    }
  }

  async function handleCalculate() {
    if (!validateRequest() || !currentScope) {
      return;
    }

    setIsCalculating(true);
    setRequestErrorMessage(null);
    setFooterErrorMessage(null);

    try {
      const response = await fetch(
        `/api/auth/tenant/current/scopes/${currentScope.id}/events/calculate-current-age`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            unity_id: unityId,
            location_id: locationId,
            item_id: itemId
          })
        }
      );
      const data: unknown = await response.json().catch(() => ({}));

      if (!response.ok) {
        setRequestErrorMessage(
          resolveCurrentAgeRequestErrorMessage(
            data,
            copy.calculateError,
            copy,
            actionLabelById,
            formulaStatementById,
            formulaRawStatementById,
            fieldLabelById
          )
        );
        return;
      }

      setResult(data as ScopeCurrentAgeCalculationResponse);
    } catch (error) {
      setRequestErrorMessage(
        error instanceof Error && error.message.trim()
          ? error.message
          : copy.calculateError
      );
    } finally {
      setIsCalculating(false);
    }
  }

  async function handleDelete() {
    if (!validateRequest() || !currentScope) {
      return;
    }

    setIsDeleting(true);
    setRequestErrorMessage(null);
    setFooterErrorMessage(null);

    try {
      const response = await fetch(
        `/api/auth/tenant/current/scopes/${currentScope.id}/events/delete-current-age`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            unity_id: unityId,
            location_id: locationId,
            item_id: itemId
          })
        }
      );
      const data: unknown = await response.json().catch(() => ({}));

      if (!response.ok) {
        setRequestErrorMessage(parseErrorDetail(data, copy.deleteError) ?? copy.deleteError);
        return;
      }

      setResult(data as ScopeCurrentAgeCalculationResponse);
    } catch (error) {
      setRequestErrorMessage(
        error instanceof Error && error.message.trim()
          ? error.message
          : copy.deleteError
      );
    } finally {
      setIsDeleting(false);
    }
  }

  function getSavedInputValue(eventId: number, fieldId: number): string {
    const inputList = inputListByEventId[eventId];
    if (!inputList) {
      return "";
    }
    const row = inputList.find((entry) => entry.field_id === fieldId);
    return row?.value ?? "";
  }

  function clearEditingInputValue(fieldId: number) {
    setEditingInputValueByFieldId((prev) => {
      if (!(fieldId in prev)) {
        return prev;
      }
      const { [fieldId]: _omit, ...rest } = prev;
      return rest;
    });
  }

  function extractInputFieldIdList(statement: string): number[] {
    const fieldIdList: number[] = [];
    const seen = new Set<number>();
    for (const match of statement.matchAll(FORMULA_REFERENCE_TOKEN)) {
      if (match[1] !== "input") {
        continue;
      }
      const id = Number(match[2]);
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      fieldIdList.push(id);
    }
    return fieldIdList;
  }

  async function handleInputOkClick(
    item: ScopeCurrentAgeCalculationRecord,
    fieldIdList: number[]
  ) {
    if (!currentScope || !canEdit || isSavingInput) {
      return;
    }
    const eventId = item.event_id;
    const existingList = inputListByEventId[eventId] ?? [];

    const baselineStatement =
      formulaRawStatementById.get(item.formula_id) ?? "";
    const editingFormulaValue = editingFormulaStatementByFormulaId[item.formula_id];
    const currentFormulaValue =
      editingFormulaValue != null ? editingFormulaValue : baselineStatement;
    const trimmedFormulaValue = currentFormulaValue.trim();
    const isFormulaDirty = trimmedFormulaValue !== baselineStatement.trim();

    if (isFormulaDirty && !trimmedFormulaValue) {
      setInputSaveError(copy.formulaStatementRequiredError);
      return;
    }

    type PendingSave = {
      fieldId: number;
      trimmedValue: string;
      existingId: number | null;
    };
    const pendingSaveList: PendingSave[] = [];

    for (const fieldId of fieldIdList) {
      const savedValue = getSavedInputValue(eventId, fieldId);
      const editingValue = editingInputValueByFieldId[fieldId];
      const rawValue = editingValue != null ? editingValue : savedValue;
      const trimmed = rawValue.trim();
      if (!trimmed) {
        setInputSaveError(
          renderTemplateWithSlots(copy.inputEditRequiredError, {
            fieldLabel: fieldLabelById.get(fieldId) ?? `#${fieldId}`
          })
        );
        return;
      }
      if (trimmed === savedValue.trim()) {
        continue;
      }
      const existing = existingList.find((entry) => entry.field_id === fieldId);
      pendingSaveList.push({
        fieldId,
        trimmedValue: trimmed,
        existingId: existing?.id ?? null
      });
    }

    setIsSavingInput(true);
    setInputSaveError(null);

    if (isFormulaDirty) {
      try {
        const response = await fetch(
          `/api/auth/tenant/current/scopes/${currentScope.id}/actions/${item.action_id}/formulas/${item.formula_id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ statement: trimmedFormulaValue })
          }
        );
        const data: unknown = await response.json().catch(() => ({}));
        if (!response.ok) {
          setInputSaveError(
            parseErrorDetail(data, copy.formulaSaveError) ?? copy.formulaSaveError
          );
          setIsSavingInput(false);
          return;
        }
        setFormulaStatementByFormulaIdState((prev) => ({
          ...prev,
          [item.formula_id]: trimmedFormulaValue
        }));
        setEditingFormulaStatementByFormulaId((prev) => {
          if (!(item.formula_id in prev)) {
            return prev;
          }
          const { [item.formula_id]: _omit, ...rest } = prev;
          return rest;
        });
      } catch (error) {
        setInputSaveError(
          error instanceof Error && error.message.trim()
            ? error.message
            : copy.formulaSaveError
        );
        setIsSavingInput(false);
        return;
      }
    }

    try {
      for (const pendingSave of pendingSaveList) {
        const endpoint = pendingSave.existingId != null
          ? `/api/auth/tenant/current/scopes/${currentScope.id}/events/${eventId}/inputs/${pendingSave.existingId}`
          : `/api/auth/tenant/current/scopes/${currentScope.id}/events/${eventId}/inputs`;
        const method = pendingSave.existingId != null ? "PATCH" : "POST";
        const body = pendingSave.existingId != null
          ? { value: pendingSave.trimmedValue }
          : { field_id: pendingSave.fieldId, value: pendingSave.trimmedValue };
        const response = await fetch(endpoint, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        const data: unknown = await response.json().catch(() => ({}));
        if (!response.ok) {
          setInputSaveError(
            parseErrorDetail(data, copy.inputEditSaveError) ?? copy.inputEditSaveError
          );
          setIsSavingInput(false);
          return;
        }
        const listResponse = data as ScopeInputListResponse;
        setInputListByEventId((prev) => ({
          ...prev,
          [eventId]: listResponse.item_list
        }));
      }
    } catch (error) {
      setInputSaveError(
        error instanceof Error && error.message.trim()
          ? error.message
          : copy.inputEditSaveError
      );
      setIsSavingInput(false);
      return;
    }

    for (const fieldId of fieldIdList) {
      clearEditingInputValue(fieldId);
    }

    try {
      await handleCalculate();
    } finally {
      setIsSavingInput(false);
    }
  }

  function renderValueCell(
    item: ScopeCurrentAgeCalculationRecord,
    field: TenantScopeFieldRecord,
    key: string
  ) {
    const isExpanded = activeDropdown?.resultId === item.result_id;
    const isStandardOrigin = item.event_unity_id == null;
    const isInputBacked = formulaHasInputToken(
      formulaRawStatementById.get(item.formula_id)
    );
    const isDirectResult = item.result_age === item.event_age;
    const inputBackedClass = isInputBacked && isDirectResult
      ? isStandardOrigin
        ? "ui-current-age-table-value-cell-input-standard"
        : "ui-current-age-table-value-cell-input-unity"
      : null;
    const valueCellClassName = [
      "ui-current-age-table-value-cell",
      inputBackedClass
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <td key={key} className={valueCellClassName}>
        <div className="ui-current-age-table-value-dropdown">
          <button
            type="button"
            className="ui-current-age-table-value-button"
            data-current-age-dropdown-anchor
            onClick={(event) => {
              if (isExpanded) {
                setActiveDropdown(null);
                return;
              }

              const rect = event.currentTarget.getBoundingClientRect();
              const dropdownWidth = 352;
              const viewportPadding = 12;
              const left = Math.min(
                Math.max(viewportPadding, rect.left),
                window.innerWidth - dropdownWidth - viewportPadding
              );

              setActiveDropdown({
                resultId: item.result_id,
                anchorTop: rect.top,
                anchorBottom: rect.bottom,
                left
              });
            }}
            aria-expanded={isExpanded}
          >
            {formatPersistedValue(item, copy.emptyValue, field.sql_type)}
          </button>
        </div>
      </td>
    );
  }

  return (
    <section className="ui-page-stack ui-page-stack-footer">
      <PageHeader
        title={copy.title}
        description={copy.description}
        actionSlot={(
          <StatusPanel
            title={isReady ? copy.statusReadyTitle : copy.statusMissingTitle}
            description={isReady ? copy.statusReadyDescription : copy.statusMissingDescription}
            tone={isReady ? "positive" : "attention"}
          />
        )}
      />

      {!currentScope ? (
        <div className="ui-panel ui-empty-panel">{asideEmptyMessage}</div>
      ) : (
        <>
          {!canEdit ? (
            <div className="ui-notice-attention ui-notice-block">{copy.readOnlyNotice}</div>
          ) : null}

          <div className="ui-current-age-filter-panel">
            <DirectoryFilterPanel>
              <DirectoryFilterCard>
                <div className="ui-field">
                  <label className="ui-field-label" htmlFor="current-age-unity">
                    {copy.unityLabel}
                  </label>
                  <select
                    id="current-age-unity"
                    className="ui-input ui-input-select"
                    value={unityId == null ? "" : String(unityId)}
                    onChange={(event) => {
                      const raw = event.target.value;
                      const nextUnityId = parsePositiveIntOrNull(raw);
                      setUnityId(nextUnityId);
                      if (nextUnityId != null) {
                        const record = unityRecordById.get(nextUnityId);
                        if (record) {
                          setLocationId(record.location_id);
                          if (itemId != null && !record.item_id_list.includes(itemId)) {
                            setItemId(null);
                          }
                        }
                      }
                      setRequestErrorMessage(null);
                      setFooterErrorMessage(null);
                    }}
                    disabled={!canEdit || !isReady || isCalculating || isReading || isDeleting}
                  >
                    <option value="" aria-label={copy.filterAllAria}></option>
                    {unityOptionList.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.label}
                      </option>
                    ))}
                  </select>
                  <p className="ui-field-hint">{copy.unityHint}</p>
                </div>
              </DirectoryFilterCard>

              <DirectoryFilterCard>
              <HierarchySingleSelectField
                id="current-age-location"
                label={copy.locationLabel}
                itemList={filteredLocationItemList}
                value={locationId}
                onChange={(nextValue) => {
                  setLocationId(nextValue);
                  setRequestErrorMessage(null);
                  setFooterErrorMessage(null);
                }}
                getParentId={(item) => item.parent_location_id ?? null}
                allLabel=""
                disabled={
                  !canEdit
                  || !isReady
                  || isCalculating
                  || isReading
                  || isDeleting
                  || selectedUnityRecord != null
                }
              />
              <p className="ui-field-hint">{copy.locationHint}</p>
              </DirectoryFilterCard>

              <DirectoryFilterCard>
              <HierarchySingleSelectField
                id="current-age-item"
                label={copy.itemLabel}
                itemList={filteredItemItemList}
                value={itemId}
                onChange={(nextValue) => {
                  setItemId(nextValue);
                  setRequestErrorMessage(null);
                  setFooterErrorMessage(null);
                }}
                getParentId={(row) => row.parent_item_id ?? null}
                allLabel=""
                disabled={!canEdit || !isReady || isCalculating || isReading || isDeleting}
              />
              <p className="ui-field-hint">{copy.itemHint}</p>
              </DirectoryFilterCard>
            </DirectoryFilterPanel>
          </div>

          <section className="ui-page-stack">
            {result == null || result.item_list.length === 0 ? null : (
              <>
                <div className="ui-current-age-table-view-toggle">
                  <ConfigurationPanelVisibilitySwitch
                    checked={!isGroupedView}
                    ariaLabel={copy.detailedViewAriaLabel}
                    label={copy.detailedViewLabel}
                    onToggle={() => setIsGroupedView((prev) => !prev)}
                  />
                </div>
                <div className="ui-current-age-table-shell ui-panel">
                  <div className="ui-current-age-table-scroll">
                    <table className="ui-current-age-table">
                    <caption className="ui-sr-only">{copy.title}</caption>
                    <colgroup>
                      <col className="ui-current-age-table-column-date" />
                      {fieldList.map((field) => (
                        <col key={`col-${field.id}`} className="ui-current-age-table-column-value" />
                      ))}
                      <col className="ui-current-age-table-column-detail" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th scope="col">{copy.resultAgeLabel}</th>
                        {fieldList.map((field) => (
                          <th
                            key={`header-${field.id}`}
                            scope="col"
                            className="ui-current-age-table-value-heading"
                          >
                            {field.label_name?.trim() || `#${field.id}`}
                          </th>
                        ))}
                        <th aria-hidden="true" className="ui-current-age-table-spacer-heading"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {isGroupedView
                        ? dayRowList.map(({ resultAge, recordByFieldId }, dayIndex) => {
                          const rowClassName = dayIndex % 2 === 0
                            ? "ui-current-age-table-day-band-even"
                            : "ui-current-age-table-day-band-odd";

                          return (
                            <tr
                              key={resultAge}
                              className={rowClassName}
                            >
                              <td>{String(resultAge)}</td>
                              {fieldList.map((field) => {
                                const item = recordByFieldId.get(field.id);
                                if (!item) {
                                  return <td key={`${resultAge}-${field.id}`}></td>;
                                }
                                return renderValueCell(item, field, `${resultAge}-${field.id}`);
                              })}
                              <td aria-hidden="true" className="ui-current-age-table-spacer-cell"></td>
                            </tr>
                          );
                        })
                        : executionRowList.map((item, rowIndex) => {
                          const rowClassName = rowIndex % 2 === 0
                            ? "ui-current-age-table-day-band-even"
                            : "ui-current-age-table-day-band-odd";

                          return (
                            <tr
                              key={item.result_id}
                              className={rowClassName}
                            >
                              <td>{String(item.result_age)}</td>
                              {fieldList.map((field) => {
                                if (field.id !== item.field_id) {
                                  return <td key={`${item.result_id}-${field.id}`}></td>;
                                }
                                return renderValueCell(item, field, `${item.result_id}-${field.id}`);
                              })}
                              <td aria-hidden="true" className="ui-current-age-table-spacer-cell"></td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                  </div>
                </div>
              </>
            )}
          </section>

        </>
      )}

      {footerPortalTarget && currentScope
        ? createPortal(
          <ConfigurationEditorFooter
            configurationPath={configurationPath}
            cancelLabel={copy.cancel}
            discardConfirm={copy.discardConfirm}
            isDirty={false}
            footerErrorMessage={combinedFooterError}
            footerNoticeMessage={footerNoticeMessage}
            footerNoticeTone="attention"
            onSave={() => void handleRead()}
            saveDisabled={!canEdit || !isReady || isCalculating || isReading || isDeleting}
            saveLabel={copy.read}
            savingLabel={copy.reading}
            isSaving={isReading}
            startContent={(
              <button
                type="button"
                className="ui-button-danger"
                onClick={() => void handleDelete()}
                disabled={!canEdit || !isReady || isCalculating || isReading || isDeleting}
                aria-busy={isDeleting}
              >
                {copy.delete}
                {isDeleting ? (
                  <span className="ui-sr-only" role="status">
                    {copy.deleting}
                  </span>
                ) : null}
              </button>
            )}
            endContent={(
              <button
                type="button"
                className="ui-button-primary"
                onClick={() => void handleCalculate()}
                disabled={!canEdit || !isReady || isCalculating || isReading || isDeleting}
                aria-busy={isCalculating}
              >
                {copy.calculate}
                {isCalculating ? (
                  <span className="ui-sr-only" role="status">
                    {copy.calculating}
                  </span>
                ) : null}
              </button>
            )}
          />,
          footerPortalTarget
        )
        : null}

      {activeDropdown
        ? createPortal(
          (() => {
            const item = resultRowList.find((entry) => entry.result_id === activeDropdown.resultId);
            if (!item) {
              return null;
            }

            const resolvedTop =
              dropdownPlacement?.top ?? activeDropdown.anchorBottom + 6;
            const dropdownStyle = {
              "--ui-current-age-dropdown-top": `${resolvedTop}px`,
              "--ui-current-age-dropdown-left": `${activeDropdown.left}px`,
              visibility: dropdownPlacement == null ? "hidden" : undefined,
              maxHeight:
                dropdownPlacement?.maxHeight != null
                  ? `${dropdownPlacement.maxHeight}px`
                  : undefined,
              overflowY:
                dropdownPlacement?.maxHeight != null ? "auto" : undefined
            } as CSSProperties;

            const rawStatement =
              formulaRawStatementById.get(item.formula_id) ?? `#${item.formula_id}`;
            const hasInputToken = formulaHasInputToken(rawStatement);
            const inputFieldIdList = hasInputToken
              ? extractInputFieldIdList(rawStatement)
              : [];
            const inputsDisabled =
              !canEdit || isCalculating || isReading || isDeleting || isSavingInput;
            const editingFormulaValue = editingFormulaStatementByFormulaId[item.formula_id];
            const currentFormulaValue =
              editingFormulaValue != null ? editingFormulaValue : rawStatement;
            const isFormulaDirty = currentFormulaValue.trim() !== rawStatement.trim();
            const showOkButton =
              canEdit && (isFormulaDirty || (hasInputToken && inputFieldIdList.length > 0));
            const showEditBlock = canEdit;

            return (
              <div
                ref={dropdownPanelRef}
                className="ui-current-age-table-dropdown-panel"
                data-current-age-dropdown-panel
                style={dropdownStyle}
              >
                <div className="ui-current-age-formula-box-row">
                  <span>
                    {actionLabelById.get(item.action_id) ?? copy.fallbackAction}
                  </span>
                </div>
                <div className="ui-current-age-formula-box-row">
                  <span>
                    {locationLabelById.get(item.location_id) ?? `#${item.location_id}`}
                  </span>
                </div>
                <div className="ui-current-age-formula-box-row">
                  <span>
                    {itemLabelById.get(item.item_id) ?? `#${item.item_id}`}
                  </span>
                </div>
                <div className="ui-current-age-formula-box-row ui-current-age-formula-box-row-formula">
                  {canEdit ? (
                    <FormulaStatementEditor
                      id={`current-age-formula-${item.formula_id}`}
                      value={currentFormulaValue}
                      onChange={(next) => {
                        setEditingFormulaStatementByFormulaId((prev) => ({
                          ...prev,
                          [item.formula_id]: next
                        }));
                        setInputSaveError(null);
                      }}
                      disabled={inputsDisabled}
                      fieldList={fieldOptionList}
                      unknownFieldLabel={copy.formulaUnknownFieldLabel}
                      ariaLabel={copy.formulaStatementAriaLabel}
                    />
                  ) : (
                    <span className="ui-current-age-formula-box-formula">
                      {renderFormulaStatementInline(rawStatement, fieldLabelById)}
                    </span>
                  )}
                </div>
                {showEditBlock ? (
                  <div className="ui-current-age-formula-box-edit">
                    {hasInputToken && inputFieldIdList.length > 0
                      ? inputFieldIdList.map((fieldId) => {
                        const field = fieldRecordById.get(fieldId);
                        const sqlType = field?.sql_type;
                        const isNumeric =
                          isIntegerSqlType(sqlType) || extractNumericScale(sqlType) != null;
                        const isIntegerOnly = isIntegerSqlType(sqlType);
                        const savedValue = getSavedInputValue(item.event_id, fieldId);
                        const editingValue = editingInputValueByFieldId[fieldId];
                        const currentValue = editingValue != null ? editingValue : savedValue;
                        const scale = extractNumericScale(sqlType);
                        const step = isIntegerOnly
                          ? "1"
                          : scale != null && scale > 0
                            ? `0.${"0".repeat(scale - 1)}1`
                            : "any";
                        const inputId = `current-age-input-${item.result_id}-${fieldId}`;
                        const fieldLabel = fieldLabelById.get(fieldId) ?? `#${fieldId}`;
                        return (
                          <div
                            key={fieldId}
                            className="ui-field ui-current-age-formula-box-edit-field"
                          >
                            <label className="ui-field-label" htmlFor={inputId}>
                              {fieldLabel}
                            </label>
                            <input
                              id={inputId}
                              className="ui-input"
                              type={isNumeric ? "number" : "text"}
                              inputMode={
                                isNumeric ? (isIntegerOnly ? "numeric" : "decimal") : undefined
                              }
                              step={isNumeric ? step : undefined}
                              value={currentValue}
                              disabled={inputsDisabled}
                              onChange={(event) => {
                                const nextValue = event.target.value;
                                setEditingInputValueByFieldId((prev) => ({
                                  ...prev,
                                  [fieldId]: nextValue
                                }));
                                setInputSaveError(null);
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  void handleInputOkClick(item, inputFieldIdList);
                                }
                              }}
                            />
                          </div>
                        );
                      })
                      : null}
                    {isSavingInput ? (
                      <div
                        className="ui-current-age-formula-box-feedback"
                        role="status"
                        aria-live="polite"
                      >
                        {copy.inputEditSaving}
                      </div>
                    ) : null}
                    {inputSaveError ? (
                      <div
                        className="ui-current-age-formula-box-feedback ui-current-age-formula-box-feedback-error"
                        role="alert"
                      >
                        {inputSaveError}
                      </div>
                    ) : null}
                    {showOkButton ? (
                      <div className="ui-current-age-formula-box-actions">
                        <button
                          type="button"
                          className="ui-button-primary"
                          onClick={() => void handleInputOkClick(item, inputFieldIdList)}
                          disabled={inputsDisabled}
                          aria-busy={isSavingInput}
                        >
                          {copy.inputEditOkButton}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })(),
          document.body
        )
        : null}

    </section>
  );
}
