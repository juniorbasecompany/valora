"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { LocaleFlagMenu } from "@/component/i18n/locale-flag-menu";
import {
  googleIdTokenStorageKey,
  rememberMeChoiceStorageKey,
  tenantSelectionStorageKey
} from "@/lib/auth/session";
import type {
  TenantListResponse,
  TenantOption
} from "@/lib/auth/types";

type AccountMenuCopy = {
  tenantSectionLabel: string;
  localeFlagTriggerAriaLabel: string;
  localeFlagMenuAriaLabel: string;
  configurationLabel: string;
  loadingTenantList: string;
  tenantListError: string;
  emptyTenantList: string;
  switchingTenant: string;
  switchingLocale: string;
  activeLabel: string;
  signOutLabel: string;
  signOutPendingLabel: string;
};

type AccountMenuProps = {
  accountName: string;
  currentLocale: string;
  localeList: string[];
  currentTenantId: number;
  configurationHref: string;
  copy: AccountMenuCopy;
  placement?: "default" | "sidebar";
};

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
    >
      <path
        d="M4 6L8 10L12 6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function getTenantDisplayName(tenant: TenantOption) {
  return tenant.display_name || tenant.name;
}

function getInitials(accountName: string) {
  const value = accountName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("");

  return value || accountName.slice(0, 2);
}

export function AccountMenu({
  accountName,
  currentLocale,
  localeList,
  currentTenantId,
  configurationHref,
  copy,
  placement = "default"
}: AccountMenuProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isSidebar = placement === "sidebar";
  const [activeMenu, setActiveMenu] = useState<"account" | "locale" | null>(
    null
  );
  const isAccountMenuOpen = activeMenu === "account";
  const [tenantList, setTenantList] = useState<TenantOption[]>([]);
  const [hasLoadedTenantList, setHasLoadedTenantList] = useState(false);
  const [isLoadingTenantList, setIsLoadingTenantList] = useState(false);
  const [tenantListError, setTenantListError] = useState<string | null>(null);
  const [switchingTenantId, setSwitchingTenantId] = useState<number | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const loadTenantList = useCallback(async () => {
    setIsLoadingTenantList(true);
    setTenantListError(null);

    try {
      const response = await fetch("/api/auth/tenant/list", {
        method: "GET"
      });
      const data = (await response.json()) as Partial<TenantListResponse> & {
        detail?: string;
      };

      if (!response.ok) {
        setTenantListError(data.detail || copy.tenantListError);
        setIsLoadingTenantList(false);
        return;
      }

      setTenantList(data.tenant_list ?? []);
      setHasLoadedTenantList(true);
    } catch {
      setTenantListError(copy.tenantListError);
    } finally {
      setIsLoadingTenantList(false);
    }
  }, [copy.tenantListError]);

  useEffect(() => {
    if (!isAccountMenuOpen || hasLoadedTenantList || isLoadingTenantList) {
      return;
    }

    void loadTenantList();
  }, [
    hasLoadedTenantList,
    isLoadingTenantList,
    isAccountMenuOpen,
    loadTenantList
  ]);

  useEffect(() => {
    if (!activeMenu) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setActiveMenu(null);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setActiveMenu(null);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [activeMenu]);

  useEffect(() => {
    setSwitchingTenantId(null);
  }, [currentLocale, currentTenantId]);

  async function handleTenantSelect(tenantId: number) {
    if (tenantId === currentTenantId || switchingTenantId !== null) {
      setActiveMenu(null);
      return;
    }

    setSwitchingTenantId(tenantId);
    setTenantListError(null);

    try {
      const response = await fetch("/api/auth/switch-tenant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          tenant_id: tenantId
        })
      });
      const data = (await response.json()) as { detail?: string };

      if (!response.ok) {
        setTenantListError(data.detail || copy.tenantListError);
        setSwitchingTenantId(null);
        return;
      }

      setSwitchingTenantId(null);
      setActiveMenu(null);
      router.refresh();
    } catch {
      setTenantListError(copy.tenantListError);
      setSwitchingTenantId(null);
    }
  }

  async function handleSignOut() {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);

    try {
      await fetch("/api/auth/logout", {
        method: "POST"
      });
    } finally {
      sessionStorage.removeItem(googleIdTokenStorageKey);
      sessionStorage.removeItem(tenantSelectionStorageKey);
      sessionStorage.removeItem(rememberMeChoiceStorageKey);
      router.replace(`/${currentLocale}/login?reason=signed_out`);
    }
  }

  const optionClass = (isActive: boolean) =>
    `ui-menu-item flex w-full min-h-[2.75rem] items-center justify-between gap-3 px-3 py-2 text-left text-sm ${
      isActive ? "ui-menu-item-active" : ""
    }`;

  const panelClassName =
    placement === "sidebar"
      ? "ui-menu-panel absolute left-0 top-[calc(100%+0.375rem)] z-40 flex min-w-[18rem] w-max max-w-[min(calc(100vw-3rem),22rem)] flex-col gap-0 overflow-hidden p-0"
      : "ui-menu-panel absolute left-0 top-[calc(100%+0.375rem)] flex max-h-[min(70vh,28rem)] w-[min(calc(100vw-3rem),22rem)] flex-col gap-0 overflow-hidden p-0 sm:min-w-[19rem] sm:max-w-[min(calc(100vw-3rem),22rem)]";

  return (
    <div
      ref={containerRef}
      className="relative isolate w-full max-w-full"
    >
      <div className="flex w-full max-w-full items-center gap-2">
        <div className={`${isSidebar ? "order-2 relative min-w-0 flex-1" : "order-1 relative min-w-0 flex-1"}`}>
          <button
            type="button"
            aria-expanded={isAccountMenuOpen}
            aria-haspopup="menu"
            data-state={isAccountMenuOpen ? "open" : "closed"}
            onClick={() =>
              setActiveMenu((currentValue) =>
                currentValue === "account" ? null : "account"
              )
            }
            className={`inline-flex w-full min-w-0 items-center text-sm font-medium text-[var(--color-text)] ${
              isSidebar
                ? "gap-2 rounded-none border-0 bg-transparent px-0 py-0 shadow-none leading-none"
                : "ui-menu-trigger gap-3 rounded-[var(--radius-control)] pl-2 pr-2.5 sm:pl-2.5 sm:pr-3"
            }`}
          >
            {!isSidebar ? (
              <span className="ui-avatar shrink-0">
                {getInitials(accountName)}
              </span>
            ) : null}
            <span className="min-w-0 flex-1 text-left">
              <span className={`block truncate text-[var(--color-text)] ${
                isSidebar
                  ? "relative -top-px text-[0.8rem] font-medium leading-none tracking-[-0.01em]"
                  : "text-sm font-semibold"
              }`}>
                {accountName}
              </span>
            </span>
            <ChevronDownIcon
              className={`shrink-0 ${isSidebar ? "text-[var(--color-text)]" : "text-[var(--color-text-subtle)]"} transition-transform duration-200 ${
                isAccountMenuOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {isAccountMenuOpen ? (
            <div
              role="menu"
              aria-label={accountName}
              className={panelClassName}
            >
                <div className="max-h-[min(52vh,20rem)] overflow-y-auto overscroll-contain px-1 py-2">
                  <section
                    className="px-3 pb-2"
                    aria-label={copy.tenantSectionLabel}
                  >
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-subtle)]">
                      {copy.tenantSectionLabel}
                    </p>

                    {isLoadingTenantList || switchingTenantId !== null ? (
                      <div className="mb-2 flex justify-end">
                        {isLoadingTenantList ? (
                          <span className="text-xs text-[var(--color-text-subtle)]">
                            {copy.loadingTenantList}
                          </span>
                        ) : null}
                        {switchingTenantId !== null ? (
                          <span className="text-xs text-[var(--color-text-subtle)]">
                            {copy.switchingTenant}
                          </span>
                        ) : null}
                      </div>
                    ) : null}

                    {tenantListError ? (
                      <p className="m-0 rounded-[var(--radius-control)] border border-[var(--color-danger-border)] bg-[var(--color-danger-surface)] px-3 py-2 text-sm text-[var(--color-danger-text)]">
                        {tenantListError}
                      </p>
                    ) : null}

                    {!isLoadingTenantList && !tenantListError ? (
                      <div className="flex flex-col gap-0.5">
                        {tenantList.map((tenant) => {
                          const isActive = tenant.tenant_id === currentTenantId;

                          return (
                            <button
                              key={tenant.tenant_id}
                              type="button"
                              role="menuitem"
                              onClick={() =>
                                void handleTenantSelect(tenant.tenant_id)
                              }
                              disabled={switchingTenantId !== null}
                              className={optionClass(isActive)}
                            >
                              <span className="min-w-0 truncate">
                                {getTenantDisplayName(tenant)}
                              </span>
                              {isActive ? (
                                <span className="ui-menu-badge">
                                  {copy.activeLabel}
                                </span>
                              ) : null}
                            </button>
                          );
                        })}

                        {tenantList.length === 0 ? (
                          <p className="m-0 px-3 py-2 text-sm text-[var(--color-text-subtle)]">
                            {copy.emptyTenantList}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </section>
                </div>

                <div className="ui-menu-footer flex shrink-0 flex-col gap-0.5 px-2 pb-2">
                  <Link
                    href={configurationHref}
                    role="menuitem"
                    onClick={() => setActiveMenu(null)}
                    className="ui-menu-item flex min-h-[2.75rem] w-full items-center rounded-[var(--radius-control)] px-3 py-2 text-sm font-medium text-[var(--color-text)]"
                  >
                    {copy.configurationLabel}
                  </Link>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => void handleSignOut()}
                    disabled={isSigningOut}
                    className="ui-menu-item ui-menu-sign-out flex min-h-[2.75rem] w-full items-center rounded-[var(--radius-control)] px-3 py-2 text-left text-sm font-medium disabled:opacity-60"
                  >
                    {isSigningOut
                      ? copy.signOutPendingLabel
                      : copy.signOutLabel}
                  </button>
                </div>
            </div>
          ) : null}
        </div>

        <div className={`${isSidebar ? "order-1 shrink-0 self-center" : "order-2 shrink-0"}`}>
          <LocaleFlagMenu
            key={currentLocale}
            currentLocale={currentLocale}
            localeList={localeList}
            placement={placement === "sidebar" ? "sidebar" : "default"}
            open={activeMenu === "locale"}
            onOpenChange={(open) =>
              setActiveMenu((current) => {
                if (open) {
                  return "locale";
                }
                return current === "locale" ? null : current;
              })
            }
            copy={{
              triggerAriaLabel: copy.localeFlagTriggerAriaLabel,
              menuAriaLabel: copy.localeFlagMenuAriaLabel,
              switchingLocale: copy.switchingLocale,
              activeLabel: copy.activeLabel
            }}
          />
        </div>
      </div>

    </div>
  );
}
