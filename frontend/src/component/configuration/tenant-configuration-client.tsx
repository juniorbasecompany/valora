"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { MouseEvent } from "react";
import { createPortal } from "react-dom";

import { PageHeader } from "@/component/app-shell/page-header";
import { StatusPanel } from "@/component/app-shell/status-panel";
import { BuildingIcon, HistoryIcon, PreviewIcon } from "@/component/ui/ui-icons";
import type { TenantCurrentResponse } from "@/lib/auth/types";

export type TenantConfigurationCopy = {
  eyebrow: string;
  title: string;
  description: string;
  statusTitle: string;
  statusDescription: string;
  tabGeneral: string;
  tabHistory: string;
  tabListAriaLabel: string;
  historyTitle: string;
  historyDescription: string;
  sectionDisplayTitle: string;
  sectionDisplayDescription: string;
  displayNameLabel: string;
  displayNameHint: string;
  sectionLegalTitle: string;
  sectionLegalDescription: string;
  legalNameLabel: string;
  legalNameHint: string;
  metadataIdLabel: string;
  cancel: string;
  delete: string;
  undoDelete: string;
  save: string;
  saving: string;
  back: string;
  readOnlyNotice: string;
  savedNotice: string;
  saveError: string;
  deleteError: string;
  validationError: string;
  discardConfirm: string;
};

type TenantConfigurationClientProps = {
  locale: string;
  initialTenant: TenantCurrentResponse;
  copy: TenantConfigurationCopy;
};

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

export function TenantConfigurationClient({
  locale,
  initialTenant,
  copy
}: TenantConfigurationClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = normalizeTab(searchParams.get("tab"));

  const configurationPath = `/${locale}/app/configuration`;
  const tenantPath = `/${locale}/app/configuration/tenant`;

  const [tenant, setTenant] = useState(initialTenant);
  const [displayName, setDisplayName] = useState(initialTenant.display_name);
  const [legalName, setLegalName] = useState(initialTenant.name);
  const [baseline, setBaseline] = useState({
    display: initialTenant.display_name,
    legal: initialTenant.name
  });

  useEffect(() => {
    setTenant(initialTenant);
    setDisplayName(initialTenant.display_name);
    setLegalName(initialTenant.name);
    setBaseline({
      display: initialTenant.display_name,
      legal: initialTenant.name
    });
    setIsDeletePending(false);
  }, [initialTenant]);

  const [fieldError, setFieldError] = useState<{
    displayName?: string;
    legalName?: string;
  }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeletePending, setIsDeletePending] = useState(false);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalTarget(document.getElementById("app-shell-footer-slot"));
  }, []);

  const isDirty = useMemo(() => {
    return (
      displayName.trim() !== baseline.display.trim() ||
      legalName.trim() !== baseline.legal.trim() ||
      isDeletePending
    );
  }, [baseline.display, baseline.legal, displayName, isDeletePending, legalName]);

  const setTab = useCallback(
    (next: "general" | "history") => {
      const url =
        next === "history"
          ? `${tenantPath}?tab=history`
          : tenantPath;
      router.replace(url);
    },
    [router, tenantPath]
  );

  const validate = useCallback(() => {
    const nextError: { displayName?: string; legalName?: string } = {};
    if (!displayName.trim()) {
      nextError.displayName = copy.validationError;
    }
    if (!legalName.trim()) {
      nextError.legalName = copy.validationError;
    }
    setFieldError(nextError);
    return Object.keys(nextError).length === 0;
  }, [copy.validationError, displayName, legalName]);

  const handleSave = useCallback(async () => {
    setFormError(null);
    setSaveSuccess(false);
    if (!isDeletePending && !validate()) {
      return;
    }
    setIsSaving(true);
    try {
      const response = await fetch(
        "/api/auth/tenant/current",
        isDeletePending
          ? {
              method: "DELETE"
            }
          : {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                display_name: displayName.trim(),
                name: legalName.trim()
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
      if (isDeletePending) {
        await fetch("/api/auth/logout", {
          method: "POST"
        }).catch(() => null);
        router.replace(`/${locale}/login?reason=signed_out`);
        return;
      }
      const updated = data as TenantCurrentResponse;
      setTenant(updated);
      setDisplayName(updated.display_name);
      setLegalName(updated.name);
      setBaseline({
        display: updated.display_name,
        legal: updated.name
      });
      setIsDeletePending(false);
      setSaveSuccess(true);
      router.refresh();
    } catch {
      setFormError(isDeletePending ? copy.deleteError : copy.saveError);
    } finally {
      setIsSaving(false);
    }
  }, [
    copy.deleteError,
    copy.saveError,
    displayName,
    isDeletePending,
    legalName,
    locale,
    router,
    validate
  ]);

  const handleToggleDelete = useCallback(() => {
    if (!tenant.can_delete || isSaving) {
      return;
    }
    setFormError(null);
    setSaveSuccess(false);
    setIsDeletePending((previous) => !previous);
  }, [isSaving, tenant.can_delete]);

  const handleBack = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (isDirty && !window.confirm(copy.discardConfirm)) {
        event.preventDefault();
      }
    },
    [copy.discardConfirm, isDirty]
  );

  const pageTitle = tenant.display_name.trim() || copy.title;
  const previewDisplayName = displayName.trim() || pageTitle;
  const previewLegalName = legalName.trim() || tenant.name;

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
          id="tenant-tab-general"
          aria-selected={tab === "general"}
          aria-controls="tenant-panel-general"
          className={`ui-tab ${
            tab === "general"
              ? "ui-tab-active"
              : ""
          }`}
          onClick={() => setTab("general")}
        >
          {copy.tabGeneral}
        </button>
        <button
          type="button"
          role="tab"
          id="tenant-tab-history"
          aria-selected={tab === "history"}
          aria-controls="tenant-panel-history"
          className={`ui-tab ${
            tab === "history"
              ? "ui-tab-active"
              : ""
          }`}
          onClick={() => setTab("history")}
        >
          {copy.tabHistory}
        </button>
      </div>

      {tab === "general" ? (
        <div
          id="tenant-panel-general"
          role="tabpanel"
          aria-labelledby="tenant-tab-general"
          className="ui-layout-record ui-layout-record-editor"
        >
          <div
            className="ui-panel ui-panel-editor"
            data-delete-pending={isDeletePending ? "true" : undefined}
          >
            {!tenant.can_edit ? (
              <div className="ui-notice-attention ui-notice-block">
                {copy.readOnlyNotice}
              </div>
            ) : null}

            {saveSuccess ? (
              <div className="ui-status-panel ui-tone-positive ui-status-copy">
                {copy.savedNotice}
              </div>
            ) : null}

            {formError ? (
              <div className="ui-notice-danger ui-notice-block">{formError}</div>
            ) : null}

            <section className="ui-card ui-form-section ui-border-accent">
              <div className="ui-section-header">
                <span className="ui-icon-badge">
                  <PreviewIcon className="ui-icon-sm" />
                </span>
                <div className="ui-section-copy">
                  <h2 className="ui-header-title ui-title-section">
                    {copy.sectionDisplayTitle}
                  </h2>
                  <p className="ui-copy-body">
                    {copy.sectionDisplayDescription}
                  </p>
                </div>
              </div>
              <div className="ui-field">
                <label className="ui-field-label" htmlFor="tenant-display-name">
                  {copy.displayNameLabel}
                </label>
                <input
                  id="tenant-display-name"
                  className="ui-input"
                  value={displayName}
                  onChange={(event) => {
                    setDisplayName(event.target.value);
                    setFieldError((previous) => ({
                      ...previous,
                      displayName: undefined
                    }));
                    setSaveSuccess(false);
                  }}
                  disabled={isDeletePending || !tenant.can_edit}
                  autoComplete="organization"
                  aria-invalid={Boolean(fieldError.displayName)}
                  aria-describedby="tenant-display-name-hint"
                />
                <p id="tenant-display-name-hint" className="ui-field-hint">
                  {copy.displayNameHint}
                </p>
                {fieldError.displayName ? (
                  <p className="ui-field-error">{fieldError.displayName}</p>
                ) : null}
              </div>
            </section>

            <section className="ui-card ui-form-section ui-border-accent">
              <div className="ui-section-header">
                <span className="ui-icon-badge">
                  <BuildingIcon className="ui-icon-sm" />
                </span>
                <div className="ui-section-copy">
                  <h2 className="ui-header-title ui-title-section">
                    {copy.sectionLegalTitle}
                  </h2>
                  <p className="ui-copy-body">
                    {copy.sectionLegalDescription}
                  </p>
                </div>
              </div>
              <div className="ui-field">
                <label className="ui-field-label" htmlFor="tenant-legal-name">
                  {copy.legalNameLabel}
                </label>
                <input
                  id="tenant-legal-name"
                  className="ui-input"
                  value={legalName}
                  onChange={(event) => {
                    setLegalName(event.target.value);
                    setFieldError((previous) => ({
                      ...previous,
                      legalName: undefined
                    }));
                    setSaveSuccess(false);
                  }}
                  disabled={isDeletePending || !tenant.can_edit}
                  autoComplete="organization-title"
                  aria-invalid={Boolean(fieldError.legalName)}
                  aria-describedby="tenant-legal-name-hint"
                />
                <p id="tenant-legal-name-hint" className="ui-field-hint">
                  {copy.legalNameHint}
                </p>
                {fieldError.legalName ? (
                  <p className="ui-field-error">{fieldError.legalName}</p>
                ) : null}
              </div>
            </section>

            <section className="ui-metadata-card">
              <p className="ui-metadata-label">
                {copy.metadataIdLabel}
              </p>
              <p className="ui-metadata-value-strong">
                {tenant.id}
              </p>
            </section>

            <div className="ui-divider-top" />
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
                    {copy.displayNameLabel}
                  </h2>
                  <p className="ui-copy-body">
                    {copy.displayNameHint}
                  </p>
                </div>
              </div>

              <div className="ui-preview-stack">
                <div className="ui-preview-card ui-preview-card-accent">
                  <p className="ui-metadata-label">
                    {copy.displayNameLabel}
                  </p>
                  <p className="ui-preview-headline">
                    {previewDisplayName}
                  </p>
                </div>

                <div className="ui-preview-card">
                  <p className="ui-metadata-label">
                    {copy.legalNameLabel}
                  </p>
                  <p className="ui-preview-value-strong">
                    {previewLegalName}
                  </p>
                </div>
              </div>
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
          id="tenant-panel-history"
          role="tabpanel"
          aria-labelledby="tenant-tab-history"
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
                <div
                  key={index}
                  className="ui-card ui-card-coming-soon ui-history-card"
                >
                  <div className="ui-skeleton ui-skeleton-label ui-pulse" />
                  <div className="ui-skeleton ui-skeleton-line ui-skeleton-line-medium ui-space-top-md ui-pulse" />
                  <div className="ui-skeleton ui-skeleton-line ui-skeleton-line-short ui-space-top-sm ui-pulse" />
                </div>
              ))}
            </div>
          </div>

          <StatusPanel
            title={copy.statusTitle}
            description={copy.statusDescription}
            tone="neutral"
          />
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
                <button
                  type="button"
                  className="ui-button-danger"
                  onClick={handleToggleDelete}
                  disabled={!tenant.can_delete || isSaving}
                >
                  {isDeletePending ? copy.undoDelete : copy.delete}
                </button>
                <button
                  type="button"
                  className="ui-button-primary"
                  onClick={() => void handleSave()}
                  disabled={!tenant.can_edit || isSaving || !isDirty}
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
