"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { createPortal } from "react-dom";

import { PageHeader } from "@/component/app-shell/page-header";
import { StatusPanel } from "@/component/app-shell/status-panel";
import { HistoryIcon, PreviewIcon, ScopeIcon } from "@/component/ui/ui-icons";
import type {
  TenantScopeDirectoryResponse,
  TenantScopeRecord
} from "@/lib/auth/types";

export type ScopeConfigurationCopy = {
  eyebrow: string;
  title: string;
  description: string;
  statusTitle: string;
  statusDescription: string;
  tabGeneral: string;
  tabHistory: string;
  tabListAriaLabel: string;
  listTitle: string;
  listDescription: string;
  empty: string;
  historyTitle: string;
  historyDescription: string;
  sectionIdentityTitle: string;
  sectionIdentityDescription: string;
  nameLabel: string;
  nameHint: string;
  displayNameLabel: string;
  displayNameHint: string;
  metadataIdLabel: string;
  cancel: string;
  newScope: string;
  delete: string;
  undoDelete: string;
  save: string;
  saving: string;
  readOnlyNotice: string;
  savedNotice: string;
  createdNotice: string;
  deletedNotice: string;
  saveError: string;
  createError: string;
  deleteError: string;
  validationError: string;
  discardConfirm: string;
  selectPrompt: string;
};

type ScopeConfigurationClientProps = {
  locale: string;
  initialDirectory: TenantScopeDirectoryResponse;
  copy: ScopeConfigurationCopy;
};

type ScopeSelectionKey = number | "new" | null;

function normalizeTab(raw: string | null): "general" | "history" {
  return raw === "history" ? "history" : "general";
}

function parseErrorDetail(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === "string" && detail.trim()) {
    return detail;
  }

  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as { msg?: string };
    if (typeof first?.msg === "string" && first.msg.trim()) {
      return first.msg;
    }
  }

  return fallback;
}

function resolveScopeLabel(scope: TenantScopeRecord) {
  return scope.name.trim() || scope.display_name.trim() || `#${scope.id}`;
}

function parseSelectedScopeKey(raw: string | null): ScopeSelectionKey {
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

function resolveSelectedScopeKey(
  itemList: TenantScopeRecord[],
  preferredKey: ScopeSelectionKey,
  canCreate: boolean
): ScopeSelectionKey {
  if (preferredKey === "new") {
    return canCreate ? "new" : (itemList[0]?.id ?? null);
  }

  if (typeof preferredKey === "number") {
    return itemList.find((item) => item.id === preferredKey)?.id ?? (itemList[0]?.id ?? null);
  }

  return itemList[0]?.id ?? (canCreate ? "new" : null);
}

function buildScopePath(
  basePath: string,
  tab: "general" | "history",
  scopeKey: ScopeSelectionKey
) {
  const params = new URLSearchParams();

  if (tab === "history") {
    params.set("tab", "history");
  }

  if (scopeKey === "new") {
    params.set("scope", "new");
  } else if (typeof scopeKey === "number") {
    params.set("scope", String(scopeKey));
  }

  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function ScopeConfigurationClient({
  locale,
  initialDirectory,
  copy
}: ScopeConfigurationClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = normalizeTab(searchParams.get("tab"));
  const initialSearchScopeKey =
    parseSelectedScopeKey(searchParams.get("scope")) ??
    initialDirectory.current_scope_id ??
    null;
  const initialSelectedScopeKey = resolveSelectedScopeKey(
    initialDirectory.item_list,
    initialSearchScopeKey,
    initialDirectory.can_create
  );
  const initialSelectedScope =
    typeof initialSelectedScopeKey === "number"
      ? initialDirectory.item_list.find((item) => item.id === initialSelectedScopeKey) ?? null
      : null;

  const configurationPath = `/${locale}/app/configuration`;
  const scopePath = `/${locale}/app/configuration/scope`;

  const [directory, setDirectory] = useState(initialDirectory);
  const [selectedScopeId, setSelectedScopeId] = useState<number | null>(
    typeof initialSelectedScopeKey === "number" ? initialSelectedScopeKey : null
  );
  const [isCreateMode, setIsCreateMode] = useState(initialSelectedScopeKey === "new");
  const [name, setName] = useState(initialSelectedScope?.name ?? "");
  const [displayName, setDisplayName] = useState(
    initialSelectedScope?.display_name ?? ""
  );
  const [baseline, setBaseline] = useState({
    name: initialSelectedScope?.name ?? "",
    displayName: initialSelectedScope?.display_name ?? ""
  });
  const [fieldError, setFieldError] = useState<{
    name?: string;
    displayName?: string;
  }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeletePending, setIsDeletePending] = useState(false);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const initialSearchScopeKeyRef = useRef<ScopeSelectionKey>(initialSearchScopeKey);
  const selectedScopeKeyRef = useRef<ScopeSelectionKey>(initialSelectedScopeKey);
  const didResolveInitialUrlRef = useRef(false);

  useEffect(() => {
    setPortalTarget(document.getElementById("app-shell-footer-slot"));
  }, []);

  const selectedScope = useMemo(() => {
    if (isCreateMode) {
      return null;
    }

    return (
      directory.item_list.find((item) => item.id === selectedScopeId) ??
      directory.item_list[0] ??
      null
    );
  }, [directory.item_list, isCreateMode, selectedScopeId]);

  useEffect(() => {
    selectedScopeKeyRef.current = isCreateMode ? "new" : selectedScope?.id ?? null;
  }, [isCreateMode, selectedScope]);

  const syncFromDirectory = useCallback(
    (
      nextDirectory: TenantScopeDirectoryResponse,
      preferredKey?: ScopeSelectionKey,
      nextSuccessMessage: string | null = null
    ) => {
      const nextKey = resolveSelectedScopeKey(
        nextDirectory.item_list,
        preferredKey ?? null,
        nextDirectory.can_create
      );
      const nextSelectedScope =
        typeof nextKey === "number"
          ? nextDirectory.item_list.find((item) => item.id === nextKey) ?? null
          : null;

      setDirectory(nextDirectory);
      setIsCreateMode(nextKey === "new");
      setSelectedScopeId(typeof nextKey === "number" ? nextKey : null);
      setName(nextSelectedScope?.name ?? "");
      setDisplayName(nextSelectedScope?.display_name ?? "");
      setBaseline({
        name: nextSelectedScope?.name ?? "",
        displayName: nextSelectedScope?.display_name ?? ""
      });
      setFieldError({});
      setFormError(null);
      setIsDeletePending(false);
      setSuccessMessage(nextSuccessMessage);

      return nextKey;
    },
    []
  );

  useEffect(() => {
    const preferredKey = didResolveInitialUrlRef.current
      ? selectedScopeKeyRef.current
      : initialSearchScopeKeyRef.current;

    didResolveInitialUrlRef.current = true;
    syncFromDirectory(initialDirectory, preferredKey);
  }, [initialDirectory, syncFromDirectory]);

  useEffect(() => {
    const currentPath = buildScopePath(
      scopePath,
      tab,
      parseSelectedScopeKey(searchParams.get("scope"))
    );
    const nextPath = buildScopePath(
      scopePath,
      tab,
      isCreateMode ? "new" : selectedScope?.id ?? null
    );

    if (currentPath !== nextPath) {
      router.replace(nextPath);
    }
  }, [isCreateMode, router, scopePath, searchParams, selectedScope, tab]);

  const isDirty = useMemo(() => {
    return (
      name.trim() !== baseline.name.trim() ||
      displayName.trim() !== baseline.displayName.trim() ||
      isDeletePending
    );
  }, [baseline.displayName, baseline.name, displayName, isDeletePending, name]);

  const setTab = useCallback(
    (next: "general" | "history") => {
      router.replace(
        buildScopePath(scopePath, next, isCreateMode ? "new" : selectedScope?.id ?? null)
      );
    },
    [isCreateMode, router, scopePath, selectedScope]
  );

  const validate = useCallback(() => {
    const nextError: { name?: string; displayName?: string } = {};

    if (!name.trim()) {
      nextError.name = copy.validationError;
    }

    if (!displayName.trim()) {
      nextError.displayName = copy.validationError;
    }

    setFieldError(nextError);
    return Object.keys(nextError).length === 0;
  }, [copy.validationError, displayName, name]);

  const handleStartCreate = useCallback(() => {
    if (!directory.can_create || isSaving) {
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

  const handleSelectScope = useCallback(
    (scope: TenantScopeRecord) => {
      if (!isCreateMode && scope.id === selectedScope?.id) {
        return;
      }

      if (isDirty && !window.confirm(copy.discardConfirm)) {
        return;
      }

      syncFromDirectory(directory, scope.id);
    },
    [copy.discardConfirm, directory, isCreateMode, isDirty, selectedScope, syncFromDirectory]
  );

  const handleBack = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (isDirty && !window.confirm(copy.discardConfirm)) {
        event.preventDefault();
      }
    },
    [copy.discardConfirm, isDirty]
  );

  const handleToggleDelete = useCallback(() => {
    if (!selectedScope?.can_delete || isSaving) {
      return;
    }

    setFormError(null);
    setSuccessMessage(null);
    setIsDeletePending((previous) => !previous);
  }, [isSaving, selectedScope]);

  const handleSave = useCallback(async () => {
    setFormError(null);
    setSuccessMessage(null);

    if (!isDeletePending && !validate()) {
      return;
    }

    setIsSaving(true);
    try {
      if (isCreateMode) {
        const previousScopeIdSet = new Set(directory.item_list.map((item) => item.id));
        const response = await fetch("/api/auth/tenant/current/scopes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            display_name: displayName.trim()
          })
        });
        const data: unknown = await response.json().catch(() => ({}));

        if (!response.ok) {
          setFormError(parseErrorDetail(data, copy.createError));
          return;
        }

        const updatedDirectory = data as TenantScopeDirectoryResponse;
        const createdScopeId =
          updatedDirectory.item_list.find((item) => !previousScopeIdSet.has(item.id))?.id ??
          updatedDirectory.item_list.find(
            (item) =>
              item.name === name.trim() && item.display_name === displayName.trim()
          )?.id ??
          updatedDirectory.item_list[0]?.id ??
          null;

        syncFromDirectory(updatedDirectory, createdScopeId, copy.createdNotice);
        return;
      }

      if (!selectedScope) {
        return;
      }

      const response = await fetch(
        `/api/auth/tenant/current/scopes/${selectedScope.id}`,
        isDeletePending
          ? {
              method: "DELETE"
            }
          : {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: name.trim(),
                display_name: displayName.trim()
              })
            }
      );
      const data: unknown = await response.json().catch(() => ({}));

      if (!response.ok) {
        setFormError(
          parseErrorDetail(data, isDeletePending ? copy.deleteError : copy.saveError)
        );
        return;
      }

      const updatedDirectory = data as TenantScopeDirectoryResponse;
      const nextSelection =
        isDeletePending && updatedDirectory.item_list.length === 0
          ? updatedDirectory.can_create
            ? "new"
            : null
          : selectedScope.id;
      syncFromDirectory(
        updatedDirectory,
        nextSelection,
        isDeletePending ? copy.deletedNotice : copy.savedNotice
      );
    } catch {
      setFormError(
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
    copy.createError,
    copy.createdNotice,
    copy.deleteError,
    copy.deletedNotice,
    copy.saveError,
    copy.savedNotice,
    directory.item_list,
    displayName,
    isCreateMode,
    isDeletePending,
    name,
    selectedScope,
    syncFromDirectory,
    validate
  ]);

  const pageTitle = isCreateMode
    ? copy.newScope
    : selectedScope
      ? resolveScopeLabel(selectedScope)
      : copy.title;
  const previewLabel = name.trim() || pageTitle;
  const previewDescription =
    displayName.trim() || selectedScope?.display_name.trim() || copy.selectPrompt;
  const selectedScopeKey: ScopeSelectionKey = isCreateMode ? "new" : selectedScope?.id ?? null;
  const canEditForm = isCreateMode
    ? directory.can_create
    : selectedScope?.can_edit ?? false;
  const canSubmit = isCreateMode
    ? directory.can_create
    : isDeletePending
      ? selectedScope?.can_delete ?? false
      : selectedScope?.can_edit ?? false;

  return (
    <section className={`ui-page-stack ${tab === "general" ? "ui-page-stack-footer" : ""}`}>
      <PageHeader
        eyebrow={copy.eyebrow}
        title={pageTitle}
        description={copy.description}
        actionSlot={
          <StatusPanel
            title={copy.statusTitle}
            description={copy.statusDescription}
            tone="neutral"
          />
        }
      />

      <div
        className="ui-panel ui-tab-list"
        role="tablist"
        aria-label={copy.tabListAriaLabel}
      >
        <button
          type="button"
          role="tab"
          id="scope-tab-general"
          aria-selected={tab === "general"}
          aria-controls="scope-panel-general"
          className={`ui-tab ${
            tab === "general" ? "ui-tab-active" : ""
          }`}
          onClick={() => setTab("general")}
        >
          {copy.tabGeneral}
        </button>
        <button
          type="button"
          role="tab"
          id="scope-tab-history"
          aria-selected={tab === "history"}
          aria-controls="scope-panel-history"
          className={`ui-tab ${
            tab === "history" ? "ui-tab-active" : ""
          }`}
          onClick={() => setTab("history")}
        >
          {copy.tabHistory}
        </button>
      </div>

      {tab === "general" ? (
        <div
          id="scope-panel-general"
          role="tabpanel"
          aria-labelledby="scope-tab-general"
          className="ui-layout-directory ui-layout-directory-editor"
        >
          <aside className="ui-panel ui-stack-lg ui-panel-context-card">
            <div className="ui-row-between">
              <div className="ui-section-header">
                <span className="ui-icon-badge">
                  <ScopeIcon className="ui-icon-sm" />
                </span>
                <div className="ui-section-copy">
                  <h2 className="ui-header-title ui-title-section">
                    {copy.listTitle}
                  </h2>
                  <p className="ui-copy-body">
                    {copy.listDescription}
                  </p>
                </div>
              </div>

              {directory.can_create ? (
                <button
                  type="button"
                  className="ui-button-secondary"
                  onClick={handleStartCreate}
                  disabled={isSaving}
                >
                  {copy.newScope}
                </button>
              ) : null}
            </div>

            {!directory.can_edit ? (
              <div className="ui-notice-attention ui-notice-block">
                {copy.readOnlyNotice}
              </div>
            ) : null}

            {selectedScopeKey === "new" ? (
              <button
                type="button"
                onClick={handleStartCreate}
                className="ui-directory-create"
              >
                <p className="ui-directory-title">
                  {copy.newScope}
                </p>
                <p className="ui-directory-caption">
                  {copy.sectionIdentityDescription}
                </p>
              </button>
            ) : null}

            <div className="ui-grid-list-md">
              {directory.item_list.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectScope(item)}
                  className="ui-directory-item"
                  data-selected={item.id === selectedScope?.id ? "true" : undefined}
                  data-delete-pending={
                    item.id === selectedScope?.id && isDeletePending ? "true" : undefined
                  }
                >
                  <p className="ui-directory-title">
                    {resolveScopeLabel(item)}
                  </p>
                  <p className="ui-directory-caption-wrap">
                    {item.display_name}
                  </p>
                  <div className="ui-directory-meta">
                    <span className="ui-badge ui-badge-neutral">
                      #{item.id}
                    </span>
                  </div>
                </button>
              ))}

              {directory.item_list.length === 0 && !directory.can_create ? (
                <div className="ui-panel ui-empty-panel ui-panel-body-compact">
                  {copy.empty}
                </div>
              ) : null}
            </div>
          </aside>

          <div
            className="ui-panel ui-panel-editor"
            data-delete-pending={isDeletePending ? "true" : undefined}
          >
            {successMessage ? (
              <div className="ui-status-panel ui-tone-positive ui-status-copy">
                {successMessage}
              </div>
            ) : null}

            {formError ? (
              <div className="ui-notice-danger ui-notice-block">{formError}</div>
            ) : null}

              {selectedScopeKey ? (
              <>
                <section className="ui-card ui-form-section ui-border-accent">
                  <div className="ui-section-header">
                    <span className="ui-icon-badge">
                      <PreviewIcon className="ui-icon-sm" />
                    </span>
                    <div className="ui-section-copy">
                      <h2 className="ui-header-title ui-title-section">
                        {copy.sectionIdentityTitle}
                      </h2>
                      <p className="ui-copy-body">
                        {copy.sectionIdentityDescription}
                      </p>
                    </div>
                  </div>

                  <div className="ui-form-fields">
                    <div className="ui-field">
                      <label className="ui-field-label" htmlFor="scope-name">
                        {copy.nameLabel}
                      </label>
                      <input
                        id="scope-name"
                        className="ui-input"
                        value={name}
                        onChange={(event) => {
                          setName(event.target.value);
                          setFieldError((previous) => ({
                            ...previous,
                            name: undefined
                          }));
                          setSuccessMessage(null);
                        }}
                        disabled={isDeletePending || !canEditForm}
                        aria-invalid={Boolean(fieldError.name)}
                      />
                      <p className="ui-field-hint">
                        {copy.nameHint}
                      </p>
                      {fieldError.name ? (
                        <p className="ui-field-error">{fieldError.name}</p>
                      ) : null}
                    </div>

                    <div className="ui-field">
                      <label className="ui-field-label" htmlFor="scope-display-name">
                        {copy.displayNameLabel}
                      </label>
                      <textarea
                        id="scope-display-name"
                        className="ui-input ui-input-textarea"
                        value={displayName}
                        onChange={(event) => {
                          setDisplayName(event.target.value);
                          setFieldError((previous) => ({
                            ...previous,
                            displayName: undefined
                          }));
                          setSuccessMessage(null);
                        }}
                        disabled={isDeletePending || !canEditForm}
                        aria-invalid={Boolean(fieldError.displayName)}
                      />
                      <p className="ui-field-hint">
                        {copy.displayNameHint}
                      </p>
                      {fieldError.displayName ? (
                        <p className="ui-field-error">{fieldError.displayName}</p>
                      ) : null}
                    </div>
                  </div>
                </section>

                {!isCreateMode && selectedScope ? (
                  <section className="ui-metadata-card">
                    <p className="ui-metadata-label">
                      {copy.metadataIdLabel}
                    </p>
                    <p className="ui-metadata-value-strong">
                      {selectedScope.id}
                    </p>
                  </section>
                ) : null}
              </>
            ) : (
              <div className="ui-panel ui-empty-panel">
                {copy.selectPrompt}
              </div>
            )}
          </div>

          <aside className="ui-panel-context">
            <div
              className="ui-panel ui-panel-context ui-panel-context-body"
              data-delete-pending={isDeletePending ? "true" : undefined}
            >
              <div className="ui-section-header">
                <span className="ui-icon-badge">
                  <PreviewIcon className="ui-icon-sm" />
                </span>
                <div className="ui-section-copy">
                  <h2 className="ui-header-title ui-title-section">
                    {copy.nameLabel}
                  </h2>
                  <p className="ui-copy-body">
                    {copy.nameHint}
                  </p>
                </div>
              </div>

              {selectedScopeKey ? (
                <div className="ui-preview-stack">
                  <div className="ui-preview-card ui-preview-card-accent">
                    <p className="ui-metadata-label">
                      {copy.nameLabel}
                    </p>
                    <p className="ui-preview-headline">
                      {previewLabel}
                    </p>
                  </div>

                  <div className="ui-preview-card">
                    <p className="ui-metadata-label">
                      {copy.displayNameLabel}
                    </p>
                    <p className="ui-preview-value">
                      {previewDescription}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="ui-copy-body ui-space-top-xl">
                  {copy.selectPrompt}
                </p>
              )}
            </div>

            <div className="ui-card ui-card-coming-soon ui-panel-body-compact">
              <div className="ui-section-header">
                <span className="ui-icon-badge ui-icon-badge-construction">
                  <HistoryIcon className="ui-icon-sm" />
                </span>
                <div className="ui-section-copy">
                  <h2 className="ui-header-title ui-title-section">
                    {copy.historyTitle}
                  </h2>
                  <p className="ui-copy-body">
                    {copy.historyDescription}
                  </p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      ) : (
        <div
          id="scope-panel-history"
          role="tabpanel"
          aria-labelledby="scope-tab-history"
          className="ui-layout-record ui-layout-record-history"
        >
          <div className="ui-panel ui-panel-body">
            <div className="ui-section-header">
              <span className="ui-icon-badge ui-icon-badge-construction">
                <HistoryIcon className="ui-icon-sm" />
              </span>
              <div className="ui-section-copy">
                <h2 className="ui-header-title ui-title-section">
                  {copy.historyTitle}
                </h2>
                <p className="ui-copy-body ui-history-description">
                  {copy.historyDescription}
                </p>
              </div>
            </div>

            <div className="ui-history-list">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="ui-card ui-card-coming-soon ui-history-card">
                  <div className="ui-skeleton ui-skeleton-label ui-pulse" />
                  <div className="ui-skeleton ui-skeleton-line ui-skeleton-line-medium ui-space-top-md ui-pulse" />
                  <div className="ui-skeleton ui-skeleton-line ui-skeleton-line-short ui-space-top-sm ui-pulse" />
                </div>
              ))}
            </div>
          </div>

          <aside className="ui-history-card-side">
            <StatusPanel
              title={copy.statusTitle}
              description={copy.statusDescription}
              tone="neutral"
            />

            {selectedScopeKey ? (
              <div className="ui-panel ui-panel-context-body">
                <p className="ui-metadata-label">
                  {copy.nameLabel}
                </p>
                <p className="ui-header-title ui-history-card-title">
                  {previewLabel}
                </p>
              </div>
            ) : null}
          </aside>
        </div>
      )}

      {tab === "general" && portalTarget
        ? createPortal(
            <div className="ui-action-footer">
              <div className="ui-action-footer-start">
                <Link
                  href={configurationPath}
                  className="ui-button-secondary"
                  onClick={handleBack}
                >
                  {copy.cancel}
                </Link>
              </div>

              <div className="ui-action-footer-end">
                {!isCreateMode && selectedScope ? (
                  <button
                    type="button"
                    className="ui-button-danger"
                    onClick={handleToggleDelete}
                    disabled={!selectedScope.can_delete || isSaving}
                  >
                    {isDeletePending ? copy.undoDelete : copy.delete}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="ui-button-primary"
                  onClick={() => void handleSave()}
                  disabled={!selectedScopeKey || !canSubmit || isSaving || !isDirty}
                >
                  {isSaving ? copy.saving : copy.save}
                </button>
              </div>
            </div>,
            portalTarget
          )
        : null}
    </section>
  );
}
