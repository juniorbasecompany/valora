"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  usePathname,
  useRouter,
  useSearchParams
} from "next/navigation";

import type {
  TenantListResponse,
  TenantOption
} from "@/lib/auth/types";

type AccountMenuCopy = {
  tenantSectionLabel: string;
  localeSectionLabel: string;
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

function getLocaleHref(
  pathname: string,
  searchParams: { toString(): string },
  locale: string
) {
  const pathSegmentList = pathname.split("/");
  if (pathSegmentList.length > 1) {
    pathSegmentList[1] = locale;
  }

  const nextPathname = pathSegmentList.join("/") || `/${locale}`;
  const search = searchParams.toString();
  return search ? `${nextPathname}?${search}` : nextPathname;
}

export function AccountMenu({
  accountName,
  currentLocale,
  localeList,
  currentTenantId,
  configurationHref,
  copy
}: AccountMenuProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [tenantList, setTenantList] = useState<TenantOption[]>([]);
  const [hasLoadedTenantList, setHasLoadedTenantList] = useState(false);
  const [isLoadingTenantList, setIsLoadingTenantList] = useState(false);
  const [tenantListError, setTenantListError] = useState<string | null>(null);
  const [switchingTenantId, setSwitchingTenantId] = useState<number | null>(null);
  const [switchingLocale, setSwitchingLocale] = useState<string | null>(null);
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
    if (!isOpen || hasLoadedTenantList || isLoadingTenantList) {
      return;
    }

    void loadTenantList();
  }, [hasLoadedTenantList, isLoadingTenantList, isOpen, loadTenantList]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  useEffect(() => {
    setSwitchingTenantId(null);
    setSwitchingLocale(null);
  }, [currentLocale, currentTenantId, pathname]);

  async function handleTenantSelect(tenantId: number) {
    if (tenantId === currentTenantId || switchingTenantId !== null) {
      setIsOpen(false);
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
      setIsOpen(false);
      router.refresh();
    } catch {
      setTenantListError(copy.tenantListError);
      setSwitchingTenantId(null);
    }
  }

  function handleLocaleSelect(locale: string) {
    if (switchingLocale) {
      return;
    }

    if (locale === currentLocale) {
      setIsOpen(false);
      return;
    }

    setSwitchingLocale(locale);
    setIsOpen(false);
    router.push(getLocaleHref(pathname, searchParams, locale));
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
      router.replace(`/${currentLocale}/login?reason=signed_out`);
    }
  }

  const optionClass = (isActive: boolean) =>
    `ui-menu-item flex w-full min-h-[2.75rem] items-center justify-between gap-3 px-3 py-2 text-left text-sm ${
      isActive ? "ui-menu-item-active" : ""
    }`;

  return (
    <div ref={containerRef} className="relative isolate">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        data-state={isOpen ? "open" : "closed"}
        onClick={() => setIsOpen((currentValue) => !currentValue)}
        className="ui-menu-trigger inline-flex max-w-[min(100%,16rem)] items-center gap-2 rounded-[var(--radius-control)] pl-3.5 pr-2.5 text-sm font-medium text-[var(--color-text)]"
      >
        <span className="min-w-0 truncate">{accountName}</span>
        <ChevronDownIcon
          className={`shrink-0 text-[var(--color-text-subtle)] transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isOpen ? (
        <div
          role="menu"
          aria-label={accountName}
          className="ui-menu-panel absolute right-0 top-[calc(100%+0.375rem)] flex max-h-[min(70vh,28rem)] min-w-[19rem] max-w-[min(calc(100vw-2rem),22rem)] flex-col gap-0 overflow-hidden p-0"
        >
          <div className="max-h-[min(52vh,20rem)] overflow-y-auto overscroll-contain px-1 py-2">
            <section
              className="px-3 pb-2"
              aria-label={copy.tenantSectionLabel}
            >
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
                        onClick={() => void handleTenantSelect(tenant.tenant_id)}
                        disabled={switchingTenantId !== null}
                        className={optionClass(isActive)}
                      >
                        <span className="min-w-0 truncate">
                          {getTenantDisplayName(tenant)}
                        </span>
                        {isActive ? (
                          <span className="ui-menu-badge">{copy.activeLabel}</span>
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

            <section
              className="border-t border-[var(--color-border)] px-3 py-2"
              aria-label={copy.localeSectionLabel}
            >
              {switchingLocale ? (
                <div className="mb-2 flex justify-end">
                  <span className="text-xs text-[var(--color-text-subtle)]">
                    {copy.switchingLocale}
                  </span>
                </div>
              ) : null}

              <div className="flex flex-col gap-0.5">
                {localeList.map((locale) => {
                  const isActive = locale === currentLocale;

                  return (
                    <button
                      key={locale}
                      type="button"
                      role="menuitem"
                      onClick={() => handleLocaleSelect(locale)}
                      disabled={switchingLocale !== null}
                      className={optionClass(isActive)}
                    >
                      <span className="font-mono text-[0.8125rem] tracking-tight">
                        {locale}
                      </span>
                      {isActive ? (
                        <span className="ui-menu-badge">{copy.activeLabel}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </section>
          </div>

          <div className="ui-menu-footer flex shrink-0 flex-col gap-0.5 px-2 pb-2">
            <Link
              href={configurationHref}
              role="menuitem"
              onClick={() => setIsOpen(false)}
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
  );
}
