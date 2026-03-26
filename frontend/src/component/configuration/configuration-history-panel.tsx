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

function buildLogSearchParams(offset: number) {
  return new URLSearchParams({
    limit: String(PAGE_SIZE),
    offset: String(offset)
  });
}

function stringifyHistoryValue(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  const serialized = JSON.stringify(value);
  return serialized ?? "null";
}

function formatHistoryMomentCompact(momentUtc: string) {
  const d = new Date(momentUtc);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${h}:${min}`;
}

function toIsoDateTimeAttr(momentUtc: string) {
  const d = new Date(momentUtc);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function formatHistoryLogIdDisplay(id: number) {
  return `#${id}`;
}

function buildHistoryLineText(
  item: AuditLogRecord,
  t: (key: string, values?: Record<string, string>) => string
) {
  const moment = formatHistoryMomentCompact(item.moment_utc);
  const meta = t("metaLine", {
    actor: item.actor_name ?? t("unknownUser"),
    moment
  });

  if (item.action_type === "I") {
    return `${meta} --- ${t("verbInsert")}`;
  }

  if (item.action_type === "D") {
    return `${meta} --- ${t("verbDelete")}`;
  }

  if (item.diff_state === "ready" && item.field_change_list.length > 0) {
    const partList = item.field_change_list.map(
      (fieldChange) =>
        `${fieldChange.field_name}: ${stringifyHistoryValue(fieldChange.previous_value)} → ${stringifyHistoryValue(fieldChange.current_value)}`
    );
    return `${meta} --- ${partList.join(" --- ")}`;
  }

  if (item.diff_state === "missing_previous") {
    return `${meta} --- ${t("diffUnavailable")}`;
  }

  return `${meta} --- ${t("diffEmpty")}`;
}

function actionVerbLabel(actionType: AuditLogActionType, t: (key: string) => string) {
  if (actionType === "I") {
    return t("verbInsert");
  }

  if (actionType === "U") {
    return t("verbUpdate");
  }

  return t("verbDelete");
}

function HistoryEntryCenter({
  item,
  t
}: {
  item: AuditLogRecord;
  t: ReturnType<typeof useTranslations>;
}) {
  if (item.action_type === "I") {
    return (
      <div className="ui-history-log-cell-center-inner">
        <div className="ui-history-log-identity-pill ui-history-log-identity-pill-single">
          <span className="ui-history-log-chip-value ui-history-log-chip-value-plain">
            {t("lineInsert")}
          </span>
        </div>
      </div>
    );
  }

  if (item.action_type === "D") {
    return (
      <div className="ui-history-log-cell-center-inner">
        <div className="ui-history-log-identity-pill ui-history-log-identity-pill-single">
          <span className="ui-history-log-chip-value ui-history-log-chip-value-plain">
            {t("lineDelete")}
          </span>
        </div>
      </div>
    );
  }

  if (item.diff_state === "ready" && item.field_change_list.length > 0) {
    return (
      <div className="ui-history-log-cell-center-inner">
        {item.field_change_list.map((fieldChange) => (
          <div
            key={`${item.id}-${fieldChange.field_name}`}
            className="ui-history-log-identity-pill"
          >
            <span className="ui-history-log-chip-muted">{fieldChange.field_name}</span>
            <span className="ui-history-log-chip-value ui-history-log-chip-value-delta">
              <span className="ui-sr-only">
                {`${fieldChange.field_name}. ${t("srBeforeAfter", {
                  before: stringifyHistoryValue(fieldChange.previous_value),
                  after: stringifyHistoryValue(fieldChange.current_value)
                })}`}
              </span>
              <span className="ui-history-log-delta-inline" aria-hidden="true">
                <span>{stringifyHistoryValue(fieldChange.previous_value)}</span>
                <span className="ui-history-log-delta-arrow">→</span>
                <span>{stringifyHistoryValue(fieldChange.current_value)}</span>
              </span>
            </span>
          </div>
        ))}
      </div>
    );
  }

  const hint =
    item.diff_state === "missing_previous" ? t("diffUnavailable") : t("diffEmpty");

  return (
    <div className="ui-history-log-cell-center-inner">
      <div className="ui-history-log-identity-pill ui-history-log-identity-pill-single">
        <span className="ui-history-log-chip-value ui-history-log-chip-value-plain">{hint}</span>
      </div>
    </div>
  );
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
        const searchParams = buildLogSearchParams(offset);
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
    [tableName, t]
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
        <ul className="ui-history-log-list">
          {itemList.map((item) => {
            const lineText = buildHistoryLineText(item, t);
            const ariaLabel = `${actionVerbLabel(item.action_type, t)}. ${lineText}. ${t("entryLabel", { id: String(item.id) })}`;
            const isoAttr = toIsoDateTimeAttr(item.moment_utc);
            return (
              <li
                key={item.id}
                className="ui-history-log-entry"
                data-action={item.action_type}
                aria-label={ariaLabel}
              >
                <div className="ui-history-log-entry-row">
                  <div className="ui-history-log-cell ui-history-log-cell-start">
                    <div className="ui-history-log-identity-pill">
                      <span className="ui-history-log-chip-muted">
                        {item.actor_name ?? t("unknownUser")}
                      </span>
                      <span className="ui-history-log-chip-value ui-history-log-chip-value-plain">
                        {actionVerbLabel(item.action_type, t)}
                      </span>
                    </div>
                  </div>
                  <div className="ui-history-log-cell ui-history-log-cell-center">
                    <HistoryEntryCenter item={item} t={t} />
                  </div>
                  <div className="ui-history-log-cell ui-history-log-cell-end">
                    <div className="ui-history-log-identity-pill">
                      <span className="ui-history-log-chip-muted">
                        {formatHistoryLogIdDisplay(item.id)}
                      </span>
                      <time
                        className="ui-history-log-chip-value"
                        dateTime={isoAttr}
                        suppressHydrationWarning
                      >
                        {formatHistoryMomentCompact(item.moment_utc)}
                      </time>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
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
