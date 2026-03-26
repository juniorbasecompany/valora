"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { HistoryIcon } from "@/component/ui/ui-icons";
import { parseErrorDetail } from "@/lib/api/parse-error-detail";
import type {
  AuditLogActionType,
  AuditLogListResponse,
  AuditLogRecord,
  AuditLogTableName
} from "@/lib/auth/types";

const PAGE_SIZE = 5;

type ConfigurationHistoryPanelProps = {
  headingId?: string;
  title: string;
  description: string;
  tableName: AuditLogTableName;
  refreshKey?: number;
};

type HistoryFilterState = {
  action: "ALL" | AuditLogActionType;
  actor: string;
  from: string;
  to: string;
};

const initialFilters: HistoryFilterState = {
  action: "ALL",
  actor: "",
  from: "",
  to: ""
};

function buildHistorySearchParams(filters: HistoryFilterState, offset: number) {
  const searchParams = new URLSearchParams({
    limit: String(PAGE_SIZE),
    offset: String(offset)
  });

  if (filters.action !== "ALL") {
    searchParams.set("action", filters.action);
  }

  if (filters.actor.trim()) {
    searchParams.set("actor", filters.actor.trim());
  }

  if (filters.from) {
    searchParams.set("from", filters.from);
  }

  if (filters.to) {
    searchParams.set("to", filters.to);
  }

  return searchParams;
}

function stringifyHistoryValue(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  const serialized = JSON.stringify(value);
  return serialized ?? "null";
}

function stringifyHistoryJson(value: unknown) {
  const serialized = JSON.stringify(value ?? null, null, 2);
  return serialized ?? "null";
}

function formatHistoryMoment(momentUtc: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(momentUtc));
}

function getActionToneClassName(actionType: AuditLogActionType) {
  if (actionType === "I") {
    return "ui-badge-positive";
  }

  if (actionType === "U") {
    return "ui-badge-active";
  }

  return "ui-badge-danger";
}

export function ConfigurationHistoryPanel({
  headingId,
  title,
  description,
  tableName,
  refreshKey = 0
}: ConfigurationHistoryPanelProps) {
  const t = useTranslations("AuditHistory");
  const requestIdRef = useRef(0);

  const [draftFilters, setDraftFilters] = useState<HistoryFilterState>(initialFilters);
  const [appliedFilters, setAppliedFilters] =
    useState<HistoryFilterState>(initialFilters);
  const [itemList, setItemList] = useState<AuditLogRecord[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const loadHistory = useCallback(
    async ({ append, offset }: { append: boolean; offset: number }) => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;

      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }
      setErrorMessage(null);

      try {
        const searchParams = buildHistorySearchParams(appliedFilters, offset);
        const response = await fetch(
          `/api/auth/tenant/current/logs/${tableName}?${searchParams.toString()}`,
          {
            method: "GET",
            cache: "no-store"
          }
        );
        const data: unknown = await response.json().catch(() => ({}));

        if (requestId !== requestIdRef.current) {
          return;
        }

        if (!response.ok) {
          setErrorMessage(
            parseErrorDetail(data, t("error.load")) ?? t("error.load")
          );
          if (!append) {
            setItemList([]);
            setHasMore(false);
            setNextOffset(null);
          }
          return;
        }

        const payload = data as AuditLogListResponse;
        setItemList((previous) =>
          append ? [...previous, ...payload.item_list] : payload.item_list
        );
        setHasMore(payload.has_more);
        setNextOffset(payload.next_offset ?? null);
      } catch {
        if (requestId !== requestIdRef.current) {
          return;
        }

        setErrorMessage(t("error.load"));
        if (!append) {
          setItemList([]);
          setHasMore(false);
          setNextOffset(null);
        }
      } finally {
        if (requestId === requestIdRef.current) {
          setIsLoading(false);
          setIsLoadingMore(false);
        }
      }
    },
    [appliedFilters, tableName, t]
  );

  useEffect(() => {
    void loadHistory({ append: false, offset: 0 });
  }, [loadHistory, refreshKey]);

  return (
    <section className="ui-card ui-form-section ui-history-panel" aria-labelledby={headingId}>
      <div className="ui-section-header">
        <span className="ui-icon-badge">
          <HistoryIcon className="ui-icon" />
        </span>
        <div className="ui-section-copy">
          <h2 id={headingId} className="ui-header-title ui-title-section">
            {title}
          </h2>
          <p className="ui-copy-body">{description}</p>
        </div>
      </div>

      <div className="ui-history-filter-grid">
        <div className="ui-field">
          <label className="ui-field-label" htmlFor={`${tableName}-history-action`}>
            {t("filter.action")}
          </label>
          <select
            id={`${tableName}-history-action`}
            className="ui-input"
            value={draftFilters.action}
            onChange={(event) =>
              setDraftFilters((previous) => ({
                ...previous,
                action: event.target.value as HistoryFilterState["action"]
              }))
            }
          >
            <option value="ALL">{t("filter.allActions")}</option>
            <option value="I">{t("action.insert")}</option>
            <option value="U">{t("action.update")}</option>
            <option value="D">{t("action.delete")}</option>
          </select>
        </div>

        <div className="ui-field">
          <label className="ui-field-label" htmlFor={`${tableName}-history-actor`}>
            {t("filter.actor")}
          </label>
          <input
            id={`${tableName}-history-actor`}
            className="ui-input"
            value={draftFilters.actor}
            onChange={(event) =>
              setDraftFilters((previous) => ({
                ...previous,
                actor: event.target.value
              }))
            }
            placeholder={t("filter.actorPlaceholder")}
          />
        </div>

        <div className="ui-field">
          <label className="ui-field-label" htmlFor={`${tableName}-history-from`}>
            {t("filter.from")}
          </label>
          <input
            id={`${tableName}-history-from`}
            className="ui-input"
            type="date"
            value={draftFilters.from}
            onChange={(event) =>
              setDraftFilters((previous) => ({
                ...previous,
                from: event.target.value
              }))
            }
          />
        </div>

        <div className="ui-field">
          <label className="ui-field-label" htmlFor={`${tableName}-history-to`}>
            {t("filter.to")}
          </label>
          <input
            id={`${tableName}-history-to`}
            className="ui-input"
            type="date"
            value={draftFilters.to}
            onChange={(event) =>
              setDraftFilters((previous) => ({
                ...previous,
                to: event.target.value
              }))
            }
          />
        </div>
      </div>

      <div className="ui-button-row">
        <button
          type="button"
          className="ui-button-primary"
          onClick={() => setAppliedFilters({ ...draftFilters })}
          disabled={isLoading || isLoadingMore}
        >
          {t("action.applyFilters")}
        </button>
        <button
          type="button"
          className="ui-button-secondary"
          onClick={() => {
            setDraftFilters(initialFilters);
            setAppliedFilters(initialFilters);
          }}
          disabled={isLoading || isLoadingMore}
        >
          {t("action.clearFilters")}
        </button>
      </div>

      {errorMessage ? (
        <div className="ui-notice-danger ui-notice-block">{errorMessage}</div>
      ) : null}

      {isLoading ? (
        <div className="ui-panel ui-empty-panel ui-panel-body-compact">
          {t("loading")}
        </div>
      ) : null}

      {!isLoading && !errorMessage && itemList.length === 0 ? (
        <div className="ui-panel ui-empty-panel ui-panel-body-compact">
          {t("empty")}
        </div>
      ) : null}

      {!isLoading && !errorMessage && itemList.length > 0 ? (
        <div className="ui-history-log-list">
          {itemList.map((item) => (
            <article key={item.id} className="ui-card ui-history-log-item">
              <div className="ui-history-log-head">
                <div className="ui-history-log-meta">
                  <div className="ui-badge-row">
                    <span
                      className={`ui-badge ${getActionToneClassName(item.action_type)}`}
                    >
                      {item.action_type === "I"
                        ? t("action.insert")
                        : item.action_type === "U"
                          ? t("action.update")
                          : t("action.delete")}
                    </span>
                  </div>
                  <p className="ui-text-body-strong">
                    {formatHistoryMoment(item.moment_utc)}
                  </p>
                  <p className="ui-history-log-caption">
                    {t("actorLabel", {
                      actorName: item.actor_name ?? t("unknownUser")
                    })}
                  </p>
                </div>

                <p className="ui-history-log-caption">
                  {t("entryLabel", { id: String(item.id) })}
                </p>
              </div>

              {item.action_type === "U" ? (
                <section className="ui-history-log-section">
                  <p className="ui-text-body-strong">{t("diffTitle")}</p>
                  {item.diff_state === "ready" && item.field_change_list.length > 0 ? (
                    <div className="ui-history-diff-list">
                      {item.field_change_list.map((fieldChange) => (
                        <div
                          key={`${item.id}-${fieldChange.field_name}`}
                          className="ui-history-diff-item"
                        >
                          <p className="ui-history-diff-field">
                            {fieldChange.field_name}
                          </p>
                          <div className="ui-history-diff-values">
                            <div className="ui-history-diff-value-card">
                              <p className="ui-history-diff-label">
                                {t("previousValue")}
                              </p>
                              <pre className="ui-history-diff-value">
                                {stringifyHistoryValue(fieldChange.previous_value)}
                              </pre>
                            </div>
                            <div className="ui-history-diff-value-card">
                              <p className="ui-history-diff-label">
                                {t("currentValue")}
                              </p>
                              <pre className="ui-history-diff-value">
                                {stringifyHistoryValue(fieldChange.current_value)}
                              </pre>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : item.diff_state === "missing_previous" ? (
                    <p className="ui-field-hint">{t("diffUnavailable")}</p>
                  ) : (
                    <p className="ui-field-hint">{t("diffEmpty")}</p>
                  )}
                </section>
              ) : null}

              {item.action_type === "D" ? (
                <p className="ui-field-hint">{t("deletedNote")}</p>
              ) : null}

              <section className="ui-history-log-section">
                <p className="ui-text-body-strong">{t("rowTitle")}</p>
                <pre className="ui-history-json">{stringifyHistoryJson(item.row)}</pre>
              </section>
            </article>
          ))}
        </div>
      ) : null}

      {!errorMessage && hasMore && nextOffset != null ? (
        <div className="ui-button-row">
          <button
            type="button"
            className="ui-button-secondary"
            onClick={() => void loadHistory({ append: true, offset: nextOffset })}
            disabled={isLoadingMore}
          >
            {isLoadingMore ? t("action.loadingMore") : t("action.loadMore")}
          </button>
        </div>
      ) : null}
    </section>
  );
}
