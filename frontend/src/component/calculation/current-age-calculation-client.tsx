"use client";

import { useMemo, useState } from "react";

import { PageHeader } from "@/component/app-shell/page-header";
import { StatusPanel } from "@/component/app-shell/status-panel";
import { Badge } from "@/component/ui/badge";
import { TenantDateTimePicker } from "@/component/ui/tenant-date-time-picker";
import type {
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
  validationRequired: string;
  validationOrder: string;
  calculateError: string;
  fieldsTitle: string;
  fieldsDescription: string;
  initialBadge: string;
  currentBadge: string;
  finalBadge: string;
  targetLabel: string;
  missingLabel: string;
  resultTitle: string;
  resultDescription: string;
  resultPlaceholder: string;
  resultEmpty: string;
  createdLabel: string;
  updatedLabel: string;
  unchangedLabel: string;
  statusCreated: string;
  statusUpdated: string;
  statusUnchanged: string;
  locationLabel: string;
  itemLabel: string;
  actionLabel: string;
  fieldLabel: string;
  formulaLabel: string;
  formulaOrderLabel: string;
  calculatedAtLabel: string;
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
  copy: CurrentAgeCalculationCopy;
};

const UI_TEXT_SEPARATOR = "\u00A0\u00A0\u25CF\u00A0\u00A0";

function formatMomentCompact(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
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
  emptyValueLabel: string
) {
  if (item.text_value != null && item.text_value.trim()) {
    return item.text_value;
  }
  if (item.boolean_value != null) {
    return item.boolean_value ? "true" : "false";
  }
  if (item.numeric_value != null) {
    return String(item.numeric_value);
  }
  return emptyValueLabel;
}

type DailyResultGroup = {
  dayKey: string;
  dayLabel: string;
  locationId: number;
  itemId: number;
  calculatedAt: string;
  status: "created" | "updated" | "unchanged";
  itemList: ScopeCurrentAgeCalculationRecord[];
};

function SummaryCard({
  label,
  value
}: {
  label: string;
  value: number;
}) {
  return (
    <article className="ui-card ui-card-stack">
      <div className="ui-section-copy">
        <p className="ui-text-caption">{label}</p>
        <h2 className="ui-header-title ui-title-section">{value}</h2>
      </div>
    </article>
  );
}

export function CurrentAgeCalculationClient({
  locale,
  currentScope,
  hasAnyScope,
  initialFieldDirectory,
  initialLocationDirectory,
  initialItemDirectory,
  initialActionDirectory,
  copy
}: CurrentAgeCalculationClientProps) {
  const [momentFrom, setMomentFrom] = useState<Date | null>(null);
  const [momentTo, setMomentTo] = useState<Date | null>(null);
  const [requestErrorMessage, setRequestErrorMessage] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
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

  const fieldLabelById = useMemo(() => {
    const map = new Map<number, string>();
    for (const item of initialFieldDirectory?.item_list ?? []) {
      map.set(item.id, item.label_name?.trim() || `#${item.id}`);
    }
    return map;
  }, [initialFieldDirectory?.item_list]);

  const fieldSortOrderById = useMemo(() => {
    const map = new Map<number, number>();
    for (const [index, item] of (initialFieldDirectory?.item_list ?? []).entries()) {
      map.set(item.id, index);
    }
    return map;
  }, [initialFieldDirectory?.item_list]);

  const currentFieldLabel = currentField?.label_name?.trim() || (
    currentField ? `#${currentField.id}` : copy.missingLabel
  );

  const dailyResultList = useMemo<DailyResultGroup[]>(() => {
    if (!result) {
      return [];
    }
    const groupMap = new Map<string, DailyResultGroup>();
    for (const item of result.item_list) {
      const dayKey = item.result_moment_utc.slice(0, 10);
      const groupKey = `${dayKey}:${item.location_id}:${item.item_id}`;
      const currentGroup = groupMap.get(groupKey);
      const nextStatus = currentGroup?.status === "created" || item.status === "created"
        ? "created"
        : currentGroup?.status === "updated" || item.status === "updated"
          ? "updated"
          : "unchanged";
      if (currentGroup) {
        currentGroup.itemList.push(item);
        currentGroup.status = nextStatus;
        continue;
      }
      groupMap.set(groupKey, {
        dayKey,
        dayLabel: formatDayCompact(item.result_moment_utc),
        locationId: item.location_id,
        itemId: item.item_id,
        calculatedAt: result.calculated_moment_utc,
        status: nextStatus,
        itemList: [item]
      });
    }
    return Array.from(groupMap.values()).sort((left, right) => (
      left.dayKey.localeCompare(right.dayKey)
      || left.locationId - right.locationId
      || left.itemId - right.itemId
    ));
  }, [result]);

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
                  disabled={!canEdit || !isReady || isCalculating || isReading}
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
                  disabled={!canEdit || !isReady || isCalculating || isReading}
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
                disabled={!canEdit || !isReady || isCalculating || isReading}
              >
                {isReading ? copy.reading : copy.read}
              </button>
              <button
                type="button"
                className="ui-button-primary"
                onClick={() => void handleCalculate()}
                disabled={!canEdit || !isReady || isCalculating || isReading}
              >
                {isCalculating ? copy.calculating : copy.calculate}
              </button>
            </div>
          </section>

          <section className="ui-card ui-form-section ui-border-accent">
            <div className="ui-section-copy">
              <h2 className="ui-header-title ui-title-section">{copy.fieldsTitle}</h2>
              <p className="ui-copy-body">{copy.fieldsDescription}</p>
            </div>

            <div className="ui-badge-row">
              <Badge tone={initialField ? "active" : "neutral"}>
                {copy.initialBadge}
              </Badge>
              <Badge tone={currentField ? "attention" : "neutral"}>
                {copy.currentBadge}
              </Badge>
              <Badge tone={finalField ? "positive" : "neutral"}>
                {copy.finalBadge}
              </Badge>
            </div>

            <p className="ui-text-caption-wrap">
              {copy.targetLabel}: {currentFieldLabel}
            </p>
          </section>

          <section className="ui-page-stack">
            <div className="ui-section-copy">
              <h2 className="ui-header-title ui-title-section">{copy.resultTitle}</h2>
              <p className="ui-copy-body">{copy.resultDescription}</p>
            </div>

            {result ? (
              <section className="ui-grid-cards-3">
                <SummaryCard label={copy.createdLabel} value={result.created_count} />
                <SummaryCard label={copy.updatedLabel} value={result.updated_count} />
                <SummaryCard label={copy.unchangedLabel} value={result.unchanged_count} />
              </section>
            ) : null}

            {!result ? (
              <div className="ui-panel ui-empty-panel">{copy.resultPlaceholder}</div>
            ) : result.item_list.length === 0 ? (
              <div className="ui-panel ui-empty-panel">{copy.resultEmpty}</div>
            ) : (
              <div className="ui-grid-list-md">
                {dailyResultList.map((group) => (
                  <article
                    key={`${group.dayKey}-${group.locationId}-${group.itemId}`}
                    className="ui-panel ui-panel-body-compact"
                  >
                    <div className="ui-stack-md">
                      <div className="ui-row-between">
                        <div className="ui-section-copy">
                          <h3 className="ui-header-title ui-title-section">{group.dayLabel}</h3>
                          <p className="ui-copy-body">
                            {copy.locationLabel}: {locationLabelById.get(group.locationId) ?? copy.fallbackLocation}
                            {UI_TEXT_SEPARATOR}
                            {copy.itemLabel}: {itemLabelById.get(group.itemId) ?? copy.fallbackItem}
                          </p>
                          <p className="ui-text-caption-wrap">
                            {copy.actionLabel}: {Array.from(new Set(
                              group.itemList.map((item) => (
                                actionLabelById.get(item.action_id) ?? copy.fallbackAction
                              ))
                            )).join(UI_TEXT_SEPARATOR)}
                          </p>
                        </div>
                        <Badge
                          tone={
                            group.status === "created"
                              ? "positive"
                              : group.status === "updated"
                                ? "attention"
                                : "neutral"
                          }
                        >
                          {group.status === "created"
                            ? copy.statusCreated
                            : group.status === "updated"
                              ? copy.statusUpdated
                              : copy.statusUnchanged}
                        </Badge>
                      </div>

                      <div className="ui-badge-row">
                        {Array.from((() => {
                          const latestItemByFieldId = new Map<number, ScopeCurrentAgeCalculationRecord>();
                          for (const item of group.itemList) {
                            latestItemByFieldId.set(item.field_id, item);
                          }
                          return latestItemByFieldId.values();
                        })())
                          .sort((left, right) => (
                            (fieldSortOrderById.get(left.field_id) ?? Number.MAX_SAFE_INTEGER)
                            - (fieldSortOrderById.get(right.field_id) ?? Number.MAX_SAFE_INTEGER)
                            || left.field_id - right.field_id
                          ))
                          .map((item) => (
                            <Badge key={item.result_id} tone="neutral">
                              {fieldLabelById.get(item.field_id) ?? `#${item.field_id}`}:{" "}
                              {formatPersistedValue(item, copy.emptyValue)}
                            </Badge>
                          ))}
                      </div>

                      <p className="ui-text-caption-wrap">
                        {copy.calculatedAtLabel}: {formatMomentCompact(group.calculatedAt)}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </section>
  );
}
