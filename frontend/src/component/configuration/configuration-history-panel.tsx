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
                    <span className="ui-badge ui-badge-neutral">
                      {t("metaLine", {
                        actor: item.actor_name ?? t("unknownUser"),
                        moment: formatHistoryMoment(item.moment_utc)
                      })}
                    </span>
                  </div>
                </div>

                <p className="ui-history-log-caption">
                  {t("entryLabel", { id: String(item.id) })}
                </p>
              </div>

              {item.action_type === "U" ? (
                <section className="ui-history-log-section">
                  {item.diff_state === "ready" && item.field_change_list.length > 0 ? (
                    <div className="ui-history-diff-list">
                      {item.field_change_list.map((fieldChange) => (
                        <div
                          key={`${item.id}-${fieldChange.field_name}`}
                          className="ui-history-diff-item ui-history-diff-item-compact"
                        >
                          <p className="ui-history-diff-field">
                            {fieldChange.field_name}
                          </p>
                          <div className="ui-history-diff-inline">
                            <span className="ui-sr-only">
                              {t("srBeforeAfter", {
                                before: stringifyHistoryValue(fieldChange.previous_value),
                                after: stringifyHistoryValue(fieldChange.current_value)
                              })}
                            </span>
                            <code className="ui-history-diff-chip">
                              {stringifyHistoryValue(fieldChange.previous_value)}
                            </code>
                            <span className="ui-history-diff-arrow" aria-hidden="true">
                              →
                            </span>
                            <code className="ui-history-diff-chip">
                              {stringifyHistoryValue(fieldChange.current_value)}
                            </code>
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
