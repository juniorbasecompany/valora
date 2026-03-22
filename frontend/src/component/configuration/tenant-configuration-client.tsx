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
  deletePendingNotice: string;
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
    <section className={`flex flex-col gap-6 ${tab === "general" ? "pb-56 lg:pb-0" : ""}`}>
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
        className="ui-panel flex flex-wrap gap-1 p-1.5"
        role="tablist"
        aria-label={copy.tabListAriaLabel}
      >
        <button
          type="button"
          role="tab"
          id="tenant-tab-general"
          aria-selected={tab === "general"}
          aria-controls="tenant-panel-general"
          className={`ui-tab px-4 py-2.5 text-sm font-semibold ${
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
          className={`ui-tab px-4 py-2.5 text-sm font-semibold ${
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
          className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(19rem,0.85fr)]"
        >
          <div className={`ui-panel flex flex-col gap-6 px-6 py-6 ${isDeletePending ? "ui-delete-pending" : ""}`}>
            {!tenant.can_edit ? (
              <div className="ui-notice-attention px-4 py-3 text-sm">
                {copy.readOnlyNotice}
              </div>
            ) : null}

            {isDeletePending ? (
              <div className="ui-tone-danger rounded-[var(--radius-card)] border px-4 py-3 text-sm">
                {copy.deletePendingNotice}
              </div>
            ) : null}

            {saveSuccess ? (
              <div className="ui-tone-positive rounded-[var(--radius-card)] border px-4 py-3 text-sm">
                {copy.savedNotice}
              </div>
            ) : null}

            {formError ? (
              <div className="ui-notice-danger px-4 py-3 text-sm">{formError}</div>
            ) : null}

            <section className="ui-card border-[rgba(37,117,216,0.12)] px-5 py-5">
              <div className="flex items-start gap-4">
                <span className="ui-icon-badge">
                  <PreviewIcon className="h-[1.05rem] w-[1.05rem]" />
                </span>
                <div>
                  <h2 className="text-base font-semibold tracking-[-0.02em] text-[var(--color-text)]">
                    {copy.sectionDisplayTitle}
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-[var(--color-text-subtle)]">
                    {copy.sectionDisplayDescription}
                  </p>
                </div>
              </div>
              <div className="mt-5 space-y-2">
                <label
                  className="text-sm font-semibold text-[var(--color-text-muted)]"
                  htmlFor="tenant-display-name"
                >
                  {copy.displayNameLabel}
                </label>
                <input
                  id="tenant-display-name"
                  className="ui-input w-full"
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
                <p
                  id="tenant-display-name-hint"
                  className="text-xs leading-5 text-[var(--color-text-subtle)]"
                >
                  {copy.displayNameHint}
                </p>
                {fieldError.displayName ? (
                  <p className="text-sm text-[var(--color-danger-text)]">
                    {fieldError.displayName}
                  </p>
                ) : null}
              </div>
            </section>

            <section className="ui-card border-[rgba(37,117,216,0.12)] px-5 py-5">
              <div className="flex items-start gap-4">
                <span className="ui-icon-badge">
                  <BuildingIcon className="h-[1.05rem] w-[1.05rem]" />
                </span>
                <div>
                  <h2 className="text-base font-semibold tracking-[-0.02em] text-[var(--color-text)]">
                    {copy.sectionLegalTitle}
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-[var(--color-text-subtle)]">
                    {copy.sectionLegalDescription}
                  </p>
                </div>
              </div>
              <div className="mt-5 space-y-2">
                <label
                  className="text-sm font-semibold text-[var(--color-text-muted)]"
                  htmlFor="tenant-legal-name"
                >
                  {copy.legalNameLabel}
                </label>
                <input
                  id="tenant-legal-name"
                  className="ui-input w-full"
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
                <p
                  id="tenant-legal-name-hint"
                  className="text-xs leading-5 text-[var(--color-text-subtle)]"
                >
                  {copy.legalNameHint}
                </p>
                {fieldError.legalName ? (
                  <p className="text-sm text-[var(--color-danger-text)]">
                    {fieldError.legalName}
                  </p>
                ) : null}
              </div>
            </section>

            <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white/70 px-5 py-4 shadow-[var(--shadow-xs)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-subtle)]">
                {copy.metadataIdLabel}
              </p>
              <p className="mt-2 text-sm font-semibold text-[var(--color-text)]">
                {tenant.id}
              </p>
            </section>

            <div className="border-t border-[var(--color-border)] pt-6" />
          </div>

          <aside className="flex flex-col gap-4">
            <div className={`ui-panel p-5 ${isDeletePending ? "ui-delete-pending" : ""}`}>
              <div className="flex items-start gap-4">
                <span className="ui-icon-badge">
                  <PreviewIcon className="h-[1.05rem] w-[1.05rem]" />
                </span>
                <div>
                  <h2 className="text-base font-semibold tracking-[-0.02em] text-[var(--color-text)]">
                    {copy.displayNameLabel}
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-[var(--color-text-subtle)]">
                    {copy.displayNameHint}
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                <div className="rounded-[var(--radius-card)] border border-[rgba(37,117,216,0.14)] bg-[var(--color-accent-soft)]/55 px-4 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-subtle)]">
                    {copy.displayNameLabel}
                  </p>
                  <p className="ui-header-title mt-2 text-[1.9rem] font-semibold tracking-[-0.04em] text-[var(--color-text)]">
                    {previewDisplayName}
                  </p>
                </div>

                <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white/75 px-4 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-subtle)]">
                    {copy.legalNameLabel}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-[var(--color-text)]">
                    {previewLegalName}
                  </p>
                </div>
              </div>
            </div>

            <div className="ui-card ui-card-coming-soon p-5">
              <div className="flex items-start gap-4">
                <span className="ui-icon-badge ui-icon-badge-construction">
                  <HistoryIcon className="h-[1.05rem] w-[1.05rem]" />
                </span>
                <div>
                  <h2 className="text-base font-semibold tracking-[-0.02em] text-[var(--color-text)]">
                    {copy.historyTitle}
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-[var(--color-text-subtle)]">
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
          className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.8fr)]"
        >
          <div className="ui-panel px-6 py-6">
            <div className="flex items-start gap-4">
              <span className="ui-icon-badge ui-icon-badge-construction">
                <HistoryIcon className="h-[1.05rem] w-[1.05rem]" />
              </span>
              <div>
                <h2 className="text-base font-semibold tracking-[-0.02em] text-[var(--color-text)]">
                  {copy.historyTitle}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-text-subtle)]">
                  {copy.historyDescription}
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="ui-card ui-card-coming-soon px-4 py-4"
                >
                  <div className="ui-skeleton h-4 w-28 animate-pulse rounded" />
                  <div className="ui-skeleton mt-3 h-4 w-full max-w-xl animate-pulse rounded" />
                  <div className="ui-skeleton mt-2 h-4 w-5/6 animate-pulse rounded" />
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
            <div className="mx-auto flex w-full max-w-[112rem] flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5 lg:px-8">
              <div className="flex shrink-0 items-center">
                <Link
                  href={configurationPath}
                  className="ui-button-secondary inline-flex items-center justify-center"
                  onClick={handleBack}
                >
                  {copy.cancel}
                </Link>
              </div>

              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
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
