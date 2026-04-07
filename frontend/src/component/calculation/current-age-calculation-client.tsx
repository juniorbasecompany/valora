"use client";

import { Fragment, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { PageHeader } from "@/component/app-shell/page-header";
import {
  DirectoryFilterCard,
  DirectoryFilterPanel
} from "@/component/configuration/directory-filter-panel";
import { ConfigurationEditorFooter } from "@/component/configuration/configuration-editor-footer";
import { HierarchySingleSelectField } from "@/component/configuration/hierarchy-dropdown-field";
import { StatusPanel } from "@/component/app-shell/status-panel";
import { TenantDateTimePicker } from "@/component/ui/tenant-date-time-picker";
import type {
  ScopeCurrentAgeCalculationEmptyReason,
  ScopeFormulaRecord,
  ScopeCurrentAgeCalculationRecord,
  ScopeCurrentAgeCalculationResponse,
  TenantLocationDirectoryResponse,
  TenantScopeActionDirectoryResponse,
  TenantScopeFieldDirectoryResponse,
  TenantScopeRecord,
  TenantItemDirectoryResponse
} from "@/lib/auth/types";
import { parseErrorDetail } from "@/lib/api/parse-error-detail";

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
  startLabel: string;
  endLabel: string;
  startHint: string;
  endHint: string;
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
  validationRequired: string;
  validationOrder: string;
  calculateError: string;
  calculateErrorMissingFormulaInput: string;
  deleteError: string;
  resultPlaceholder: string;
  resultEmptyDefault: string;
  resultEmptyNoEventsBeforePeriodEnd: string;
  resultEmptyNoEligibleWindow: string;
  resultEmptyNoResultsInSelectedPeriod: string;
  resultEmptyNoPersistedResultsInPeriod: string;
  resultEmptyNoResultsToDeleteInPeriod: string;
  resultDateLabel: string;
  actionLabel: string;
  formulaLabel: string;
  emptyValue: string;
  fallbackAction: string;
};

type CurrentAgeCalculationClientProps = {
  locale: string;
  currentScope: TenantScopeRecord | null;
  hasAnyScope: boolean;
  initialFieldDirectory: TenantScopeFieldDirectoryResponse | null;
  initialLocationDirectory: TenantLocationDirectoryResponse | null;
  initialItemDirectory: TenantItemDirectoryResponse | null;
  initialActionDirectory: TenantScopeActionDirectoryResponse | null;
  initialFormulaList: ScopeFormulaRecord[];
  copy: CurrentAgeCalculationCopy;
};

function formatDayCompact(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(parsed);
}

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
  const valueText = String(value);
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
    case "no_events_before_period_end":
      return copy.resultEmptyNoEventsBeforePeriodEnd;
    case "no_eligible_window":
      return copy.resultEmptyNoEligibleWindow;
    case "no_results_in_selected_period":
      return copy.resultEmptyNoResultsInSelectedPeriod;
    case "no_persisted_results_in_period":
      return copy.resultEmptyNoPersistedResultsInPeriod;
    case "no_results_to_delete_in_period":
      return copy.resultEmptyNoResultsToDeleteInPeriod;
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

export function CurrentAgeCalculationClient({
  locale,
  currentScope,
  hasAnyScope,
  initialFieldDirectory,
  initialLocationDirectory,
  initialItemDirectory,
  initialActionDirectory,
  initialFormulaList,
  copy
}: CurrentAgeCalculationClientProps) {
  const [footerPortalTarget, setFooterPortalTarget] = useState<HTMLElement | null>(null);
  const [momentFrom, setMomentFrom] = useState<Date | null>(null);
  const [momentTo, setMomentTo] = useState<Date | null>(null);
  const [locationId, setLocationId] = useState<number | null>(null);
  const [itemId, setItemId] = useState<number | null>(null);
  const [footerErrorMessage, setFooterErrorMessage] = useState<string | null>(null);
  const [requestErrorMessage, setRequestErrorMessage] = useState<ReactNode | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [result, setResult] = useState<ScopeCurrentAgeCalculationResponse | null>(null);
  const [activeDropdown, setActiveDropdown] = useState<{
    resultId: number;
    top: number;
    left: number;
  } | null>(null);

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

  const formulaStatementById = useMemo(() => {
    const map = new Map<number, string>();
    for (const formula of initialFormulaList) {
      map.set(formula.id, formatFormulaStatement(formula.statement, fieldLabelById));
    }
    return map;
  }, [fieldLabelById, initialFormulaList]);

  const formulaRawStatementById = useMemo(() => {
    const map = new Map<number, string>();
    for (const formula of initialFormulaList) {
      map.set(formula.id, formula.statement);
    }
    return map;
  }, [initialFormulaList]);

  const fieldSortOrderById = useMemo(() => {
    const map = new Map<number, number>();
    for (const [index, item] of (initialFieldDirectory?.item_list ?? []).entries()) {
      map.set(item.id, index);
    }
    return map;
  }, [initialFieldDirectory?.item_list]);
  const fieldList = initialFieldDirectory?.item_list ?? [];

  const resultRowList = useMemo<ScopeCurrentAgeCalculationRecord[]>(() => {
    if (!result) {
      return [];
    }
    return [...result.item_list].sort((left, right) => (
      left.result_moment_utc.slice(0, 10).localeCompare(right.result_moment_utc.slice(0, 10))
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

  const resultDisplayRowList = useMemo(() => {
    let previousDayKey = "";
    let dayBandIndex = -1;

    return resultRowList.map((item) => {
      const dayKey = item.result_moment_utc.slice(0, 10);
      if (dayKey !== previousDayKey) {
        dayBandIndex += 1;
        previousDayKey = dayKey;
      }
      return { item, dayBandIndex };
    });
  }, [resultRowList]);

  const emptyResultMessage = useMemo(() => (
    resolveEmptyResultMessage(result?.empty_reason, copy)
  ), [copy, result?.empty_reason]);

  const asideEmptyMessage = !currentScope
    ? hasAnyScope
      ? copy.missingCurrentScope
      : copy.emptyScope
    : null;

  useEffect(() => {
    setFooterPortalTarget(document.getElementById("app-shell-footer-slot"));
  }, []);

  useEffect(() => {
    setActiveDropdown(null);
  }, [result, momentFrom, momentTo, locationId, itemId]);

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
      setActiveDropdown(null);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setActiveDropdown(null);
      }
    }

    function handleViewportChange() {
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
  }, [activeDropdown]);

  function validateRequest() {
    if (!currentScope || !canEdit || !isReady) {
      return false;
    }
    if (!momentFrom || !momentTo) {
      setFooterErrorMessage(copy.validationRequired);
      return false;
    }
    if (momentFrom.getTime() > momentTo.getTime()) {
      setFooterErrorMessage(copy.validationOrder);
      return false;
    }
    return true;
  }

  async function handleRead() {
    if (!validateRequest() || !currentScope) {
      return;
    }
    const currentMomentFrom = momentFrom;
    const currentMomentTo = momentTo;
    if (!currentMomentFrom || !currentMomentTo) {
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
            moment_from_utc: currentMomentFrom.toISOString(),
            moment_to_utc: currentMomentTo.toISOString(),
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
    const currentMomentFrom = momentFrom;
    const currentMomentTo = momentTo;
    if (!currentMomentFrom || !currentMomentTo) {
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
            moment_from_utc: currentMomentFrom.toISOString(),
            moment_to_utc: currentMomentTo.toISOString(),
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
    const currentMomentFrom = momentFrom;
    const currentMomentTo = momentTo;
    if (!currentMomentFrom || !currentMomentTo) {
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
            moment_from_utc: currentMomentFrom.toISOString(),
            moment_to_utc: currentMomentTo.toISOString(),
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
              <div className="ui-grid-cards-2">
                <div className="ui-field">
                  <label className="ui-field-label" htmlFor="current-age-start">
                    {copy.startLabel}
                  </label>
                  <TenantDateTimePicker
                    id="current-age-start"
                    value={momentFrom}
                    onChange={(value) => {
                      setMomentFrom(value);
                      setRequestErrorMessage(null);
                      setFooterErrorMessage(null);
                    }}
                    disabled={!canEdit || !isReady || isCalculating || isReading || isDeleting}
                    locale={locale}
                    hidePlaceholder
                    periodBoundary="start"
                  />
                  <p className="ui-field-hint">{copy.startHint}</p>
                </div>

                <div className="ui-field">
                  <label className="ui-field-label" htmlFor="current-age-end">
                    {copy.endLabel}
                  </label>
                  <TenantDateTimePicker
                    id="current-age-end"
                    value={momentTo}
                    onChange={(value) => {
                      setMomentTo(value);
                      setRequestErrorMessage(null);
                      setFooterErrorMessage(null);
                    }}
                    disabled={!canEdit || !isReady || isCalculating || isReading || isDeleting}
                    locale={locale}
                    hidePlaceholder
                    periodBoundary="end"
                  />
                  <p className="ui-field-hint">{copy.endHint}</p>
                </div>
              </div>
              </DirectoryFilterCard>

              <DirectoryFilterCard>
              <HierarchySingleSelectField
                id="current-age-location"
                label={copy.locationLabel}
                itemList={initialLocationDirectory?.item_list ?? []}
                value={locationId}
                onChange={(nextValue) => {
                  setLocationId(nextValue);
                  setRequestErrorMessage(null);
                  setFooterErrorMessage(null);
                }}
                getParentId={(item) => item.parent_location_id ?? null}
                allLabel=""
                disabled={!canEdit || !isReady || isCalculating || isReading || isDeleting}
              />
              <p className="ui-field-hint">{copy.locationHint}</p>
              </DirectoryFilterCard>

              <DirectoryFilterCard>
              <HierarchySingleSelectField
                id="current-age-item"
                label={copy.itemLabel}
                itemList={initialItemDirectory?.item_list ?? []}
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
            {requestErrorMessage ? (
              <div className="ui-panel ui-empty-panel">{requestErrorMessage}</div>
            ) : result == null ? null : result.item_list.length === 0 ? (
              <div className="ui-panel ui-empty-panel">{emptyResultMessage}</div>
            ) : (
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
                        <th scope="col">{copy.resultDateLabel}</th>
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
                      {resultDisplayRowList.map(({ item, dayBandIndex }) => {
                        const isExpanded = activeDropdown?.resultId === item.result_id;

                        return (
                          <tr
                            key={item.result_id}
                            className={dayBandIndex % 2 === 0
                              ? "ui-current-age-table-day-band-even"
                              : "ui-current-age-table-day-band-odd"}
                          >
                            <td>{formatDayCompact(item.result_moment_utc)}</td>
                            {fieldList.map((field) => {
                              if (field.id !== item.field_id) {
                                return <td key={`${item.result_id}-${field.id}`}></td>;
                              }

                              return (
                                <td
                                  key={`${item.result_id}-${field.id}`}
                                  className="ui-current-age-table-value-cell"
                                >
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
                                          top: rect.bottom + 6,
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
                            })}
                            <td aria-hidden="true" className="ui-current-age-table-spacer-cell"></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

        </>
      )}

      {footerPortalTarget && currentScope
        ? createPortal(
          <ConfigurationEditorFooter
            discardConfirm=""
            isDirty={false}
            footerErrorMessage={footerErrorMessage}
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
              >
                {isDeleting ? copy.deleting : copy.delete}
              </button>
            )}
            endContent={(
              <button
                type="button"
                className="ui-button-primary"
                onClick={() => void handleCalculate()}
                disabled={!canEdit || !isReady || isCalculating || isReading || isDeleting}
              >
                {isCalculating ? copy.calculating : copy.calculate}
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

            const dropdownStyle = {
              "--ui-current-age-dropdown-top": `${activeDropdown.top}px`,
              "--ui-current-age-dropdown-left": `${activeDropdown.left}px`
            } as CSSProperties;

            return (
              <div
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
                  <span className="ui-current-age-formula-box-formula">
                    {renderFormulaStatementInline(
                      formulaRawStatementById.get(item.formula_id) ?? `#${item.formula_id}`,
                      fieldLabelById
                    )}
                  </span>
                </div>
              </div>
            );
          })(),
          document.body
        )
        : null}

    </section>
  );
}
