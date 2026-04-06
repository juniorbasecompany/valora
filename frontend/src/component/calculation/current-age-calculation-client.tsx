"use client";

import { useMemo, useState } from "react";

import { PageHeader } from "@/component/app-shell/page-header";
import { StatusPanel } from "@/component/app-shell/status-panel";
import { TenantDateTimePicker } from "@/component/ui/tenant-date-time-picker";
import type {
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
  dateHint: string;
  read: string;
  reading: string;
  calculate: string;
  calculating: string;
  delete: string;
  deleting: string;
  validationRequired: string;
  validationOrder: string;
  calculateError: string;
  deleteError: string;
  resultPlaceholder: string;
  resultEmpty: string;
  resultDateLabel: string;
  locationLabel: string;
  itemLabel: string;
  actionLabel: string;
  formulaLabel: string;
  emptyValue: string;
  fallbackLocation: string;
  fallbackItem: string;
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

const UI_TEXT_SEPARATOR = "\u00A0\u00A0\u25CF\u00A0\u00A0";

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
  const [momentFrom, setMomentFrom] = useState<Date | null>(null);
  const [momentTo, setMomentTo] = useState<Date | null>(null);
  const [requestErrorMessage, setRequestErrorMessage] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [result, setResult] = useState<ScopeCurrentAgeCalculationResponse | null>(null);

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

  const locationLabelById = useMemo(() => {
    const map = new Map<number, string>();
    for (const item of initialLocationDirectory?.item_list ?? []) {
      const label = item.path_labels.length > 0
        ? item.path_labels.join(UI_TEXT_SEPARATOR)
        : item.name.trim() || item.display_name.trim() || `#${item.id}`;
      map.set(item.id, label);
    }
    return map;
  }, [initialLocationDirectory?.item_list]);

  const itemLabelById = useMemo(() => {
    const map = new Map<number, string>();
    for (const item of initialItemDirectory?.item_list ?? []) {
      const label = item.path_labels.length > 0
        ? item.path_labels.join(UI_TEXT_SEPARATOR)
        : item.name.trim() || item.display_name.trim() || `#${item.id}`;
      map.set(item.id, label);
    }
    return map;
  }, [initialItemDirectory?.item_list]);

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

  const fieldSortOrderById = useMemo(() => {
    const map = new Map<number, number>();
    for (const [index, item] of (initialFieldDirectory?.item_list ?? []).entries()) {
      map.set(item.id, index);
    }
    return map;
  }, [initialFieldDirectory?.item_list]);

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

  const asideEmptyMessage = !currentScope
    ? hasAnyScope
      ? copy.missingCurrentScope
      : copy.emptyScope
    : null;

  function validateRequest() {
    if (!currentScope || !canEdit || !isReady) {
      return false;
    }
    if (!momentFrom || !momentTo) {
      setRequestErrorMessage(copy.validationRequired);
      return false;
    }
    if (momentFrom.getTime() > momentTo.getTime()) {
      setRequestErrorMessage(copy.validationOrder);
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

    try {
      const response = await fetch(
        `/api/auth/tenant/current/scopes/${currentScope.id}/events/read-current-age`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            moment_from_utc: currentMomentFrom.toISOString(),
            moment_to_utc: currentMomentTo.toISOString()
          })
        }
      );
      const data: unknown = await response.json().catch(() => ({}));

      if (!response.ok) {
        setRequestErrorMessage(parseErrorDetail(data, copy.calculateError) ?? copy.calculateError);
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

    try {
      const response = await fetch(
        `/api/auth/tenant/current/scopes/${currentScope.id}/events/calculate-current-age`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            moment_from_utc: currentMomentFrom.toISOString(),
            moment_to_utc: currentMomentTo.toISOString()
          })
        }
      );
      const data: unknown = await response.json().catch(() => ({}));

      if (!response.ok) {
        setRequestErrorMessage(parseErrorDetail(data, copy.calculateError) ?? copy.calculateError);
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

    try {
      const response = await fetch(
        `/api/auth/tenant/current/scopes/${currentScope.id}/events/delete-current-age`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            moment_from_utc: currentMomentFrom.toISOString(),
            moment_to_utc: currentMomentTo.toISOString()
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
    <section className="ui-page-stack">
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

          <section className="ui-card ui-form-section ui-border-accent">
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
                  }}
                  disabled={!canEdit || !isReady || isCalculating || isReading || isDeleting}
                  locale={locale}
                  hidePlaceholder
                  periodBoundary="start"
                />
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
                  }}
                  disabled={!canEdit || !isReady || isCalculating || isReading || isDeleting}
                  locale={locale}
                  hidePlaceholder
                  periodBoundary="end"
                />
              </div>
            </div>

            <p className="ui-field-hint">{copy.dateHint}</p>
            {requestErrorMessage ? (
              <p className="ui-field-error">{requestErrorMessage}</p>
            ) : null}

            <div className="ui-button-row">
              <button
                type="button"
                className="ui-button-secondary"
                onClick={() => void handleRead()}
                disabled={!canEdit || !isReady || isCalculating || isReading || isDeleting}
              >
                {isReading ? copy.reading : copy.read}
              </button>
              <button
                type="button"
                className="ui-button-primary"
                onClick={() => void handleCalculate()}
                disabled={!canEdit || !isReady || isCalculating || isReading || isDeleting}
              >
                {isCalculating ? copy.calculating : copy.calculate}
              </button>
              <button
                type="button"
                className="ui-button-danger"
                onClick={() => void handleDelete()}
                disabled={!canEdit || !isReady || isCalculating || isReading || isDeleting}
              >
                {isDeleting ? copy.deleting : copy.delete}
              </button>
            </div>
          </section>

          <section className="ui-page-stack">
            {!result ? (
              <div className="ui-panel ui-empty-panel">{copy.resultPlaceholder}</div>
            ) : result.item_list.length === 0 ? (
              <div className="ui-panel ui-empty-panel">{copy.resultEmpty}</div>
            ) : (
              <div className="ui-current-age-table-shell ui-panel">
                <div className="ui-current-age-table-scroll">
                  <table className="ui-current-age-table">
                    <thead>
                      <tr>
                        <th>{copy.resultDateLabel}</th>
                        <th>{copy.locationLabel}</th>
                        <th>{copy.formulaLabel}</th>
                        {initialFieldDirectory?.item_list.map((field) => (
                          <th key={`header-${field.id}`}>
                            {field.label_name?.trim() || `#${field.id}`}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {resultRowList.map((item) => (
                        <tr key={item.result_id}>
                          <td>{formatDayCompact(item.result_moment_utc)}</td>
                          <td>
                            <div className="ui-current-age-table-cell-stack">
                              <span>{locationLabelById.get(item.location_id) ?? copy.fallbackLocation}</span>
                              <span>{itemLabelById.get(item.item_id) ?? copy.fallbackItem}</span>
                            </div>
                          </td>
                          <td className="ui-current-age-table-cell-formula">
                            <div className="ui-current-age-table-formula-stack">
                              <span className="ui-current-age-table-formula-action">
                                {actionLabelById.get(item.action_id) ?? copy.fallbackAction}
                              </span>
                              <span>
                                {formulaStatementById.get(item.formula_id) ?? `#${item.formula_id}`}
                              </span>
                            </div>
                          </td>
                          {(initialFieldDirectory?.item_list ?? []).map((field) => (
                            <td key={`${item.result_id}-${field.id}`}>
                              {field.id === item.field_id
                                ? formatPersistedValue(item, copy.emptyValue, field.type)
                                : ""}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </section>
  );
}
