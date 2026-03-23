"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { createPortal } from "react-dom";

import { PageHeader } from "@/component/app-shell/page-header";
import { StatusPanel } from "@/component/app-shell/status-panel";
import { HistoryIcon, PreviewIcon, UsersIcon } from "@/component/ui/ui-icons";
import type {
  TenantMemberDirectoryResponse,
  TenantMemberRecord
} from "@/lib/auth/types";

type MemberStatusKey = "ACTIVE" | "PENDING" | "DISABLED";

export type MemberConfigurationCopy = {
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
  sectionProfileTitle: string;
  sectionProfileDescription: string;
  displayNameLabel: string;
  displayNameHint: string;
  nameLabel: string;
  nameHint: string;
  sectionAccessTitle: string;
  sectionAccessDescription: string;
  emailLabel: string;
  emailHint: string;
  roleLabel: string;
  statusLabel: string;
  accountLinked: string;
  accountPending: string;
  accessManagedNotice: string;
  memberIdLabel: string;
  accountIdLabel: string;
  cancel: string;
  delete: string;
  undoDelete: string;
  save: string;
  saving: string;
  readOnlyNotice: string;
  protectedRecordNotice: string;
  savedNotice: string;
  deletedNotice: string;
  saveError: string;
  deleteError: string;
  validationError: string;
  discardConfirm: string;
  selectPrompt: string;
  roleLabels: Record<"master" | "admin" | "member", string>;
  statusLabels: Record<MemberStatusKey, string>;
};

type MemberConfigurationClientProps = {
  locale: string;
  initialDirectory: TenantMemberDirectoryResponse;
  copy: MemberConfigurationCopy;
};

const memberStatusValueByKey: Record<MemberStatusKey, number> = {
  ACTIVE: 1,
  PENDING: 2,
  DISABLED: 3
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

function resolveMemberLabel(member: TenantMemberRecord) {
  return member.display_name?.trim() || member.name?.trim() || member.email;
}

function normalizeStatusKey(raw: string): MemberStatusKey {
  if (raw === "ACTIVE" || raw === "PENDING" || raw === "DISABLED") {
    return raw;
  }

  return "DISABLED";
}

function getStatusToneClass(status: MemberStatusKey) {
  if (status === "ACTIVE") {
    return "ui-tone-positive";
  }

  if (status === "PENDING") {
    return "ui-tone-attention";
  }

  return "ui-tone-danger";
}

function parseSelectedMemberId(raw: string | null): number | null {
  if (!raw) {
    return null;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return null;
  }

  return parsed;
}

function resolveSelectedMemberId(
  itemList: TenantMemberRecord[],
  preferredMemberId: number | null
): number | null {
  return (
    itemList.find((item) => item.id === preferredMemberId)?.id ??
    itemList[0]?.id ??
    null
  );
}

function buildMemberPath(
  basePath: string,
  tab: "general" | "history",
  memberId: number | null
) {
  const params = new URLSearchParams();

  if (tab === "history") {
    params.set("tab", "history");
  }

  if (memberId != null) {
    params.set("member", String(memberId));
  }

  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function MemberConfigurationClient({
  locale,
  initialDirectory,
  copy
}: MemberConfigurationClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = normalizeTab(searchParams.get("tab"));
  const initialSearchMemberId = parseSelectedMemberId(searchParams.get("member"));
  const initialSelectedMemberId = resolveSelectedMemberId(
    initialDirectory.item_list,
    initialSearchMemberId
  );
  const initialSelectedMember =
    initialDirectory.item_list.find((item) => item.id === initialSelectedMemberId) ?? null;

  const configurationPath = `/${locale}/app/configuration`;
  const memberPath = `/${locale}/app/configuration/member`;

  const [directory, setDirectory] = useState(initialDirectory);
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(
    initialSelectedMemberId
  );
  const [displayName, setDisplayName] = useState(
    initialSelectedMember?.display_name ?? ""
  );
  const [name, setName] = useState(initialSelectedMember?.name ?? "");
  const [roleValue, setRoleValue] = useState(initialSelectedMember?.role ?? 3);
  const [statusKey, setStatusKey] = useState<MemberStatusKey>(
    normalizeStatusKey(initialSelectedMember?.status ?? "DISABLED")
  );
  const [baseline, setBaseline] = useState({
    displayName: initialSelectedMember?.display_name ?? "",
    name: initialSelectedMember?.name ?? "",
    role: initialSelectedMember?.role ?? 3,
    status: normalizeStatusKey(initialSelectedMember?.status ?? "DISABLED")
  });
  const [fieldError, setFieldError] = useState<{
    displayName?: string;
    name?: string;
  }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeletePending, setIsDeletePending] = useState(false);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const initialSearchMemberIdRef = useRef<number | null>(initialSearchMemberId);
  const selectedMemberIdRef = useRef<number | null>(initialSelectedMemberId);
  const didResolveInitialUrlRef = useRef(false);

  useEffect(() => {
    setPortalTarget(document.getElementById("app-shell-footer-slot"));
  }, []);

  useEffect(() => {
    selectedMemberIdRef.current = selectedMemberId;
  }, [selectedMemberId]);

  const selectedMember = useMemo(() => {
    return (
      directory.item_list.find((item) => item.id === selectedMemberId) ??
      directory.item_list[0] ??
      null
    );
  }, [directory.item_list, selectedMemberId]);

  const syncFromDirectory = useCallback(
    (
      nextDirectory: TenantMemberDirectoryResponse,
      preferredMemberId?: number | null,
      nextSuccessMessage: string | null = null
    ) => {
      const nextSelectedMemberId = resolveSelectedMemberId(
        nextDirectory.item_list,
        preferredMemberId ?? null
      );
      const nextSelectedMember =
        nextDirectory.item_list.find((item) => item.id === nextSelectedMemberId) ?? null;

      setDirectory(nextDirectory);
      setSelectedMemberId(nextSelectedMemberId);
      setDisplayName(nextSelectedMember?.display_name ?? "");
      setName(nextSelectedMember?.name ?? "");
      setRoleValue(nextSelectedMember?.role ?? 3);
      setStatusKey(normalizeStatusKey(nextSelectedMember?.status ?? "DISABLED"));
      setBaseline({
        displayName: nextSelectedMember?.display_name ?? "",
        name: nextSelectedMember?.name ?? "",
        role: nextSelectedMember?.role ?? 3,
        status: normalizeStatusKey(nextSelectedMember?.status ?? "DISABLED")
      });
      setFieldError({});
      setFormError(null);
      setIsDeletePending(false);
      setSuccessMessage(nextSuccessMessage);

      return nextSelectedMemberId;
    },
    []
  );

  useEffect(() => {
    const preferredMemberId = didResolveInitialUrlRef.current
      ? selectedMemberIdRef.current
      : initialSearchMemberIdRef.current;

    didResolveInitialUrlRef.current = true;
    syncFromDirectory(initialDirectory, preferredMemberId);
  }, [initialDirectory, syncFromDirectory]);

  useEffect(() => {
    const currentPath = buildMemberPath(
      memberPath,
      tab,
      parseSelectedMemberId(searchParams.get("member"))
    );
    const nextPath = buildMemberPath(memberPath, tab, selectedMemberId);

    if (currentPath !== nextPath) {
      router.replace(nextPath);
    }
  }, [memberPath, router, searchParams, selectedMemberId, tab]);

  const isDirty = useMemo(() => {
    return (
      displayName.trim() !== baseline.displayName.trim() ||
      name.trim() !== baseline.name.trim() ||
      roleValue !== baseline.role ||
      statusKey !== baseline.status ||
      isDeletePending
    );
  }, [
    baseline.displayName,
    baseline.name,
    baseline.role,
    baseline.status,
    displayName,
    isDeletePending,
    name,
    roleValue,
    statusKey
  ]);

  const setTab = useCallback(
    (next: "general" | "history") => {
      router.replace(buildMemberPath(memberPath, next, selectedMemberId));
    },
    [memberPath, router, selectedMemberId]
  );

  const validate = useCallback(() => {
    const nextError: { displayName?: string; name?: string } = {};

    if (!displayName.trim()) {
      nextError.displayName = copy.validationError;
    }

    if (!name.trim()) {
      nextError.name = copy.validationError;
    }

    setFieldError(nextError);
    return Object.keys(nextError).length === 0;
  }, [copy.validationError, displayName, name]);

  const handleSelectMember = useCallback(
    (member: TenantMemberRecord) => {
      if (member.id === selectedMemberId) {
        return;
      }

      if (isDirty && !window.confirm(copy.discardConfirm)) {
        return;
      }

      syncFromDirectory(directory, member.id);
    },
    [copy.discardConfirm, directory, isDirty, selectedMemberId, syncFromDirectory]
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
    if (!selectedMember?.can_delete || isSaving) {
      return;
    }

    setFormError(null);
    setSuccessMessage(null);
    setIsDeletePending((previous) => !previous);
  }, [isSaving, selectedMember?.can_delete]);

  const handleSave = useCallback(async () => {
    if (!selectedMember) {
      return;
    }

    setFormError(null);
    setSuccessMessage(null);

    if (!isDeletePending && !validate()) {
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(
        `/api/auth/tenant/current/members/${selectedMember.id}`,
        isDeletePending
          ? {
              method: "DELETE"
            }
          : {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                display_name: displayName.trim(),
                name: name.trim(),
                role: roleValue,
                status: memberStatusValueByKey[statusKey]
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

      const updatedDirectory = data as TenantMemberDirectoryResponse;
      syncFromDirectory(
        updatedDirectory,
        selectedMember.id,
        isDeletePending ? copy.deletedNotice : copy.savedNotice
      );
    } catch {
      setFormError(isDeletePending ? copy.deleteError : copy.saveError);
    } finally {
      setIsSaving(false);
    }
  }, [
    copy.deleteError,
    copy.deletedNotice,
    copy.saveError,
    copy.savedNotice,
    displayName,
    isDeletePending,
    name,
    roleValue,
    selectedMember,
    statusKey,
    syncFromDirectory,
    validate
  ]);

  const roleOptions = useMemo(
    () => [
      { value: 1, label: copy.roleLabels.master },
      { value: 2, label: copy.roleLabels.admin },
      { value: 3, label: copy.roleLabels.member }
    ],
    [copy.roleLabels.admin, copy.roleLabels.master, copy.roleLabels.member]
  );

  const statusOptions = useMemo(
    () =>
      selectedMember?.account_id == null
        ? [
            { value: "PENDING" as const, label: copy.statusLabels.PENDING },
            { value: "DISABLED" as const, label: copy.statusLabels.DISABLED }
          ]
        : [
            { value: "ACTIVE" as const, label: copy.statusLabels.ACTIVE },
            { value: "DISABLED" as const, label: copy.statusLabels.DISABLED }
          ],
    [
      copy.statusLabels.ACTIVE,
      copy.statusLabels.DISABLED,
      copy.statusLabels.PENDING,
      selectedMember?.account_id
    ]
  );

  const pageTitle = selectedMember ? resolveMemberLabel(selectedMember) : copy.title;
  const previewDisplayName = displayName.trim() || pageTitle;
  const previewName =
    name.trim() || selectedMember?.name?.trim() || selectedMember?.email || "-";
  const previewRoleLabel =
    roleOptions.find((option) => option.value === roleValue)?.label ?? String(roleValue);
  const canSubmit = selectedMember
    ? isDeletePending
      ? selectedMember.can_delete
      : selectedMember.can_edit
    : false;

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
        className="ui-panel ui-tab-list"
        role="tablist"
        aria-label={copy.tabListAriaLabel}
      >
        <button
          type="button"
          role="tab"
          id="member-tab-general"
          aria-selected={tab === "general"}
          aria-controls="member-panel-general"
          className={`ui-tab px-4 py-2.5 text-sm font-semibold ${
            tab === "general" ? "ui-tab-active" : ""
          }`}
          onClick={() => setTab("general")}
        >
          {copy.tabGeneral}
        </button>
        <button
          type="button"
          role="tab"
          id="member-tab-history"
          aria-selected={tab === "history"}
          aria-controls="member-panel-history"
          className={`ui-tab px-4 py-2.5 text-sm font-semibold ${
            tab === "history" ? "ui-tab-active" : ""
          }`}
          onClick={() => setTab("history")}
        >
          {copy.tabHistory}
        </button>
      </div>

      {tab === "general" ? (
        directory.item_list.length === 0 ? (
          <div id="member-panel-general" role="tabpanel" aria-labelledby="member-tab-general">
            <div className="flex flex-col gap-4">
              {successMessage ? (
                <div className="ui-status-panel ui-tone-positive text-sm">
                  {successMessage}
                </div>
              ) : null}
              {formError ? (
                <div className="ui-notice-danger px-4 py-3 text-sm">{formError}</div>
              ) : null}
              <div className="ui-panel px-6 py-6 text-sm text-[var(--color-text-muted)]">
                {copy.empty}
              </div>
            </div>
          </div>
        ) : (
          <div
            id="member-panel-general"
            role="tabpanel"
            aria-labelledby="member-tab-general"
            className="ui-layout-directory 2xl:grid-cols-[minmax(18rem,0.82fr)_minmax(0,1.18fr)_minmax(18rem,0.82fr)]"
          >
            <aside className="ui-panel flex flex-col gap-4 px-5 py-5">
              <div className="ui-section-header">
                <span className="ui-icon-badge">
                  <UsersIcon className="h-[1.05rem] w-[1.05rem]" />
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

              {!directory.can_edit ? (
                <div className="ui-notice-attention px-4 py-3 text-sm">
                  {copy.readOnlyNotice}
                </div>
              ) : null}

              <div className="grid gap-3">
                {directory.item_list.map((item) => {
                  const itemStatusKey = normalizeStatusKey(item.status);
                  const roleLabel =
                    copy.roleLabels[item.role_name as keyof typeof copy.roleLabels] ??
                    item.role_name;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectMember(item)}
                      className="ui-directory-item"
                      data-selected={item.id === selectedMember?.id ? "true" : undefined}
                      data-delete-pending={
                        item.id === selectedMember?.id && isDeletePending ? "true" : undefined
                      }
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[var(--color-text)]">
                            {resolveMemberLabel(item)}
                          </p>
                          <p className="mt-1 truncate text-xs text-[var(--color-text-subtle)]">
                            {item.email}
                          </p>
                        </div>
                        <span
                          className={`ui-pill shrink-0 px-2.5 py-1 text-[11px] font-semibold ${getStatusToneClass(itemStatusKey)}`}
                        >
                          {copy.statusLabels[itemStatusKey]}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="ui-badge ui-badge-neutral px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em]">
                          {roleLabel}
                        </span>
                        <span className="ui-badge ui-badge-neutral px-2.5 py-1 text-[11px] font-semibold">
                          #{item.id}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </aside>

            <div
              className="ui-panel ui-panel-editor px-6 py-6"
              data-delete-pending={isDeletePending ? "true" : undefined}
            >
              {successMessage ? (
                <div className="ui-status-panel ui-tone-positive text-sm">
                  {successMessage}
                </div>
              ) : null}

              {formError ? (
                <div className="ui-notice-danger px-4 py-3 text-sm">{formError}</div>
              ) : null}

              {selectedMember ? (
                <>
                  {directory.can_edit ? (
                    !selectedMember.can_edit ? (
                      <div className="ui-notice-attention px-4 py-3 text-sm">
                        {copy.protectedRecordNotice}
                      </div>
                    ) : !selectedMember.can_edit_access ? (
                      <div className="ui-status-panel ui-tone-neutral text-sm">
                        {copy.accessManagedNotice}
                      </div>
                    ) : null
                  ) : null}

                  <section className="ui-card ui-form-section ui-border-accent">
                    <div className="ui-section-header">
                      <span className="ui-icon-badge">
                        <PreviewIcon className="h-[1.05rem] w-[1.05rem]" />
                      </span>
                      <div className="ui-section-copy">
                        <h2 className="ui-header-title ui-title-section">
                          {copy.sectionProfileTitle}
                        </h2>
                        <p className="ui-copy-body">
                          {copy.sectionProfileDescription}
                        </p>
                      </div>
                    </div>

                    <div className="ui-form-fields md:grid-cols-2">
                      <div className="ui-field">
                        <label className="ui-field-label" htmlFor="member-display-name">
                          {copy.displayNameLabel}
                        </label>
                        <input
                          id="member-display-name"
                          className="ui-input w-full"
                          value={displayName}
                          onChange={(event) => {
                            setDisplayName(event.target.value);
                            setFieldError((previous) => ({
                              ...previous,
                              displayName: undefined
                            }));
                            setSuccessMessage(null);
                          }}
                          disabled={isDeletePending || !selectedMember.can_edit}
                          autoComplete="nickname"
                          aria-invalid={Boolean(fieldError.displayName)}
                        />
                        <p className="ui-field-hint">
                          {copy.displayNameHint}
                        </p>
                        {fieldError.displayName ? (
                          <p className="ui-field-error">{fieldError.displayName}</p>
                        ) : null}
                      </div>

                      <div className="ui-field">
                        <label className="ui-field-label" htmlFor="member-name">
                          {copy.nameLabel}
                        </label>
                        <input
                          id="member-name"
                          className="ui-input w-full"
                          value={name}
                          onChange={(event) => {
                            setName(event.target.value);
                            setFieldError((previous) => ({
                              ...previous,
                              name: undefined
                            }));
                            setSuccessMessage(null);
                          }}
                          disabled={isDeletePending || !selectedMember.can_edit}
                          autoComplete="name"
                          aria-invalid={Boolean(fieldError.name)}
                        />
                        <p className="ui-field-hint">
                          {copy.nameHint}
                        </p>
                        {fieldError.name ? (
                          <p className="ui-field-error">{fieldError.name}</p>
                        ) : null}
                      </div>
                    </div>
                  </section>

                  <section className="ui-card ui-form-section ui-border-accent">
                    <div className="ui-section-header">
                      <span className="ui-icon-badge">
                        <UsersIcon className="h-[1.05rem] w-[1.05rem]" />
                      </span>
                      <div className="ui-section-copy">
                        <h2 className="ui-header-title ui-title-section">
                          {copy.sectionAccessTitle}
                        </h2>
                        <p className="ui-copy-body">
                          {copy.sectionAccessDescription}
                        </p>
                      </div>
                    </div>

                    <div className="ui-form-fields md:grid-cols-3">
                      <div className="ui-field md:col-span-3">
                        <label className="ui-field-label" htmlFor="member-email">
                          {copy.emailLabel}
                        </label>
                        <input
                          id="member-email"
                          className="ui-input w-full"
                          value={selectedMember.email}
                          disabled
                          readOnly
                        />
                        <p className="ui-field-hint">
                          {copy.emailHint}
                        </p>
                      </div>

                      <div className="ui-field">
                        <label className="ui-field-label" htmlFor="member-role">
                          {copy.roleLabel}
                        </label>
                        <select
                          id="member-role"
                          className="ui-input w-full appearance-none"
                          value={roleValue}
                          onChange={(event) => {
                            setRoleValue(Number(event.target.value));
                            setSuccessMessage(null);
                          }}
                          disabled={isDeletePending || !selectedMember.can_edit_access}
                        >
                          {roleOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="ui-field">
                        <label className="ui-field-label" htmlFor="member-status">
                          {copy.statusLabel}
                        </label>
                        <select
                          id="member-status"
                          className="ui-input w-full appearance-none"
                          value={statusKey}
                          onChange={(event) => {
                            setStatusKey(normalizeStatusKey(event.target.value));
                            setSuccessMessage(null);
                          }}
                          disabled={isDeletePending || !selectedMember.can_edit_access}
                        >
                          {statusOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="ui-metadata-card">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-subtle)]">
                          {selectedMember.account_id
                            ? copy.accountLinked
                            : copy.accountPending}
                        </p>
                        <p className="mt-2 text-sm font-semibold text-[var(--color-text)]">
                          {selectedMember.account_id
                            ? `#${selectedMember.account_id}`
                            : copy.accountPending}
                        </p>
                      </div>
                    </div>
                  </section>
                </>
              ) : (
                <div className="ui-panel px-6 py-6 text-sm text-[var(--color-text-muted)]">
                  {copy.selectPrompt}
                </div>
              )}
            </div>

            <aside className="ui-panel-context">
              <div
                className="ui-panel ui-panel-context p-5"
                data-delete-pending={isDeletePending ? "true" : undefined}
              >
                <div className="ui-section-header">
                  <span className="ui-icon-badge">
                    <PreviewIcon className="h-[1.05rem] w-[1.05rem]" />
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

                {selectedMember ? (
                  <div className="ui-preview-stack">
                    <div className="ui-preview-card ui-preview-card-accent">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-subtle)]">
                        {copy.displayNameLabel}
                      </p>
                      <p className="ui-header-title mt-2 text-[1.9rem] font-semibold tracking-[-0.04em] text-[var(--color-text)]">
                        {previewDisplayName}
                      </p>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="ui-badge ui-badge-neutral px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em]">
                          {previewRoleLabel}
                        </span>
                        <span
                          className={`ui-pill px-2.5 py-1 text-[11px] font-semibold ${getStatusToneClass(statusKey)}`}
                        >
                          {copy.statusLabels[statusKey]}
                        </span>
                      </div>
                    </div>

                    <div className="ui-preview-card">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-subtle)]">
                        {copy.nameLabel}
                      </p>
                      <p className="mt-2 text-sm font-semibold text-[var(--color-text)]">
                        {previewName}
                      </p>
                      <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-subtle)]">
                        {copy.emailLabel}
                      </p>
                      <p className="mt-2 text-sm text-[var(--color-text)]">
                        {selectedMember.email}
                      </p>
                    </div>

                    <div className="ui-metadata-card">
                      <div className="ui-metadata-grid ui-metadata-grid-2">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-subtle)]">
                            {copy.memberIdLabel}
                          </p>
                          <p className="mt-2 text-sm font-semibold text-[var(--color-text)]">
                            {selectedMember.id}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-subtle)]">
                            {copy.accountIdLabel}
                          </p>
                          <p className="mt-2 text-sm font-semibold text-[var(--color-text)]">
                            {selectedMember.account_id ?? "-"}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="mt-5 text-sm leading-6 text-[var(--color-text-subtle)]">
                    {copy.selectPrompt}
                  </p>
                )}
              </div>

              <div className="ui-card ui-card-coming-soon p-5">
                <div className="ui-section-header">
                  <span className="ui-icon-badge ui-icon-badge-construction">
                    <HistoryIcon className="h-[1.05rem] w-[1.05rem]" />
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
        )
      ) : (
        <div
          id="member-panel-history"
          role="tabpanel"
          aria-labelledby="member-tab-history"
          className="ui-layout-record xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.82fr)]"
        >
          <div className="ui-panel px-6 py-6">
            <div className="ui-section-header">
              <span className="ui-icon-badge ui-icon-badge-construction">
                <HistoryIcon className="h-[1.05rem] w-[1.05rem]" />
              </span>
              <div className="ui-section-copy">
                <h2 className="ui-header-title ui-title-section">
                  {copy.historyTitle}
                </h2>
                <p className="ui-copy-body mt-2 max-w-2xl">
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

          <aside className="flex flex-col gap-4">
            <StatusPanel
              title={copy.statusTitle}
              description={copy.statusDescription}
              tone="neutral"
            />

            {selectedMember ? (
              <div className="ui-panel p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-subtle)]">
                  {copy.displayNameLabel}
                </p>
                <p className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[var(--color-text)]">
                  {resolveMemberLabel(selectedMember)}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="ui-badge ui-badge-neutral px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em]">
                    {copy.roleLabels[
                      selectedMember.role_name as keyof typeof copy.roleLabels
                    ] ?? selectedMember.role_name}
                  </span>
                  <span
                    className={`ui-pill px-2.5 py-1 text-[11px] font-semibold ${getStatusToneClass(
                      normalizeStatusKey(selectedMember.status)
                    )}`}
                  >
                    {copy.statusLabels[normalizeStatusKey(selectedMember.status)]}
                  </span>
                </div>
              </div>
            ) : null}
          </aside>
        </div>
      )}

      {tab === "general" && portalTarget
        ? createPortal(
            <div className="ui-action-footer">
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
                {selectedMember ? (
                  <button
                    type="button"
                    className="ui-button-danger"
                    onClick={handleToggleDelete}
                    disabled={!selectedMember.can_delete || isSaving}
                  >
                    {isDeletePending ? copy.undoDelete : copy.delete}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="ui-button-primary"
                  onClick={() => void handleSave()}
                  disabled={!selectedMember || !canSubmit || isSaving || !isDirty}
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
