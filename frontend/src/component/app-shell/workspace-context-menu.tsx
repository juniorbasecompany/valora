"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type {
  TenantListResponse,
  TenantOption,
  TenantScopeDirectoryResponse,
  TenantScopeRecord
} from "@/lib/auth/types";

type WorkspaceContextMenuCopy = {
  tenantTriggerAriaLabel: string;
  tenantMenuAriaLabel: string;
  scopeTriggerAriaLabel: string;
  scopeMenuAriaLabel: string;
  loadingTenantList: string;
  tenantListError: string;
  emptyTenantList: string;
  switchingTenant: string;
  loadingScopeList: string;
  scopeListError: string;
  emptyScopeList: string;
  switchingScope: string;
  noScopeLabel: string;
};

type WorkspaceContextMenuProps = {
  currentTenantId: number;
  currentTenantName: string;
  initialScopeList: TenantScopeRecord[];
  initialCurrentScopeId: number | null;
  copy: WorkspaceContextMenuCopy;
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

function getScopeDisplayName(scope: TenantScopeRecord) {
  return scope.name.trim() || scope.display_name.trim() || `#${scope.id}`;
}

export function WorkspaceContextMenu({
  currentTenantId,
  currentTenantName,
  initialScopeList,
  initialCurrentScopeId,
  copy
}: WorkspaceContextMenuProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [activeMenu, setActiveMenu] = useState<"tenant" | "scope" | null>(null);
  const [tenantList, setTenantList] = useState<TenantOption[]>([]);
  const [hasLoadedTenantList, setHasLoadedTenantList] = useState(false);
  const [isLoadingTenantList, setIsLoadingTenantList] = useState(false);
  const [tenantListError, setTenantListError] = useState<string | null>(null);
  const [switchingTenantId, setSwitchingTenantId] = useState<number | null>(null);
  const [scopeList, setScopeList] = useState<TenantScopeRecord[]>(initialScopeList);
  const [currentScopeId, setCurrentScopeId] = useState<number | null>(
    initialCurrentScopeId
  );
  const [hasLoadedScopeList, setHasLoadedScopeList] = useState(false);
  const [isLoadingScopeList, setIsLoadingScopeList] = useState(false);
  const [scopeListError, setScopeListError] = useState<string | null>(null);
  const [switchingScopeId, setSwitchingScopeId] = useState<number | null>(null);

  const isTenantMenuOpen = activeMenu === "tenant";
  const isScopeMenuOpen = activeMenu === "scope";
  const selectedScope =
    scopeList.find((scope) => scope.id === currentScopeId) ?? scopeList[0] ?? null;

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

  const loadScopeList = useCallback(async () => {
    setIsLoadingScopeList(true);
    setScopeListError(null);

    try {
      const response = await fetch("/api/auth/tenant/current/scopes", {
        method: "GET"
      });
      const data = (await response.json()) as Partial<TenantScopeDirectoryResponse> & {
        detail?: string;
      };

      if (!response.ok) {
        setScopeListError(data.detail || copy.scopeListError);
        setIsLoadingScopeList(false);
        return;
      }

      setScopeList(data.item_list ?? []);
      setCurrentScopeId(data.current_scope_id ?? null);
      setHasLoadedScopeList(true);
    } catch {
      setScopeListError(copy.scopeListError);
    } finally {
      setIsLoadingScopeList(false);
    }
  }, [copy.scopeListError]);

  useEffect(() => {
    if (isTenantMenuOpen && !hasLoadedTenantList && !isLoadingTenantList) {
      void loadTenantList();
    }
  }, [
    hasLoadedTenantList,
    isLoadingTenantList,
    isTenantMenuOpen,
    loadTenantList
  ]);

  useEffect(() => {
    if (isScopeMenuOpen && !hasLoadedScopeList && !isLoadingScopeList) {
      void loadScopeList();
    }
  }, [hasLoadedScopeList, isLoadingScopeList, isScopeMenuOpen, loadScopeList]);

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
    setScopeList(initialScopeList);
    setCurrentScopeId(initialCurrentScopeId);
    setHasLoadedScopeList(false);
    setScopeListError(null);
  }, [initialCurrentScopeId, initialScopeList]);

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

  async function handleScopeSelect(scopeId: number) {
    if (currentScopeId === scopeId || switchingScopeId !== null) {
      setActiveMenu(null);
      return;
    }

    setSwitchingScopeId(scopeId);
    setScopeListError(null);

    try {
      const response = await fetch("/api/auth/me/current-scope", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          scope_id: scopeId
        })
      });
      const data = (await response.json()) as {
        current_scope_id?: number | null;
        detail?: string;
      };

      if (!response.ok) {
        setScopeListError(data.detail || copy.scopeListError);
        setSwitchingScopeId(null);
        return;
      }

      setCurrentScopeId(data.current_scope_id ?? scopeId);
      setSwitchingScopeId(null);
      setActiveMenu(null);
      router.refresh();
    } catch {
      setScopeListError(copy.scopeListError);
      setSwitchingScopeId(null);
    }
  }

  const optionClass = (isActive: boolean) =>
    `ui-menu-item appearance-none self-stretch whitespace-nowrap rounded-none border-0 shadow-none inline-flex items-center justify-start px-4 py-2.5 text-left text-sm ${
      isActive ? "ui-menu-item-active" : ""
    }`;

  const triggerTextClass =
    "block max-w-[13.5rem] truncate text-[1.04rem] font-medium leading-6 text-[var(--color-text)]";

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="flex w-full flex-wrap items-start gap-x-3 gap-y-1.5">
        <div className="relative max-w-full shrink-0">
          <button
            type="button"
            aria-expanded={isTenantMenuOpen}
            aria-haspopup="menu"
            aria-label={copy.tenantTriggerAriaLabel}
            data-state={isTenantMenuOpen ? "open" : "closed"}
            onClick={() =>
              setActiveMenu((currentValue) =>
                currentValue === "tenant" ? null : "tenant"
              )
            }
            className="inline-flex max-w-full items-center gap-1 rounded-none border-0 bg-transparent px-0 py-0 text-left shadow-none transition-colors duration-150 hover:text-[var(--color-primary)] focus-visible:text-[var(--color-primary)]"
          >
            <span className={triggerTextClass}>{currentTenantName}</span>
            <ChevronDownIcon
              className={`mt-px shrink-0 text-[var(--color-text-subtle)] transition-transform duration-200 ${
                isTenantMenuOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {isTenantMenuOpen ? (
            <div
              role="menu"
              aria-label={copy.tenantMenuAriaLabel}
              className="ui-menu-panel absolute left-0 top-[calc(100%+0.375rem)] z-[80] inline-flex w-auto max-w-[min(calc(100vw-3rem),22rem)] flex-col gap-0 overflow-hidden rounded-none p-0"
            >
              {isLoadingTenantList || switchingTenantId !== null ? (
                <div className="flex justify-end px-4 py-2.5">
                  <span className="text-xs text-[var(--color-text-subtle)]">
                    {isLoadingTenantList
                      ? copy.loadingTenantList
                      : copy.switchingTenant}
                  </span>
                </div>
              ) : null}

              {tenantListError ? (
                <p className="m-0 border border-[var(--color-danger-border)] bg-[var(--color-danger-surface)] px-4 py-2.5 text-sm text-[var(--color-danger-text)]">
                  {tenantListError}
                </p>
              ) : null}

              {!isLoadingTenantList && !tenantListError ? (
                <div className="inline-flex flex-col items-stretch self-start gap-0">
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
                      </button>
                    );
                  })}

                  {tenantList.length === 0 ? (
                    <p className="m-0 px-4 py-2.5 text-sm text-[var(--color-text-subtle)]">
                      {copy.emptyTenantList}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="relative ml-auto max-w-full shrink-0">
          <button
            type="button"
            aria-expanded={isScopeMenuOpen}
            aria-haspopup="menu"
            aria-label={copy.scopeTriggerAriaLabel}
            data-state={isScopeMenuOpen ? "open" : "closed"}
            onClick={() =>
              setActiveMenu((currentValue) =>
                currentValue === "scope" ? null : "scope"
              )
            }
            className="inline-flex max-w-full items-center gap-1 rounded-none border-0 bg-transparent px-0 py-0 text-right shadow-none transition-colors duration-150 hover:text-[var(--color-primary)] focus-visible:text-[var(--color-primary)]"
          >
            <span className={`${triggerTextClass} text-right`}>
              {selectedScope ? getScopeDisplayName(selectedScope) : copy.noScopeLabel}
            </span>
            <ChevronDownIcon
              className={`mt-px shrink-0 text-[var(--color-text-subtle)] transition-transform duration-200 ${
                isScopeMenuOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {isScopeMenuOpen ? (
            <div
              role="menu"
              aria-label={copy.scopeMenuAriaLabel}
              className="ui-menu-panel absolute left-0 top-[calc(100%+0.375rem)] z-[80] inline-flex w-auto max-w-[min(calc(100vw-3rem),22rem)] flex-col gap-0 overflow-hidden rounded-none p-0"
            >
              {isLoadingScopeList || switchingScopeId !== null ? (
                <div className="flex justify-end px-4 py-2.5">
                  <span className="text-xs text-[var(--color-text-subtle)]">
                    {isLoadingScopeList
                      ? copy.loadingScopeList
                      : copy.switchingScope}
                  </span>
                </div>
              ) : null}

              {scopeListError ? (
                <p className="m-0 border border-[var(--color-danger-border)] bg-[var(--color-danger-surface)] px-4 py-2.5 text-sm text-[var(--color-danger-text)]">
                  {scopeListError}
                </p>
              ) : null}

              {!isLoadingScopeList && !scopeListError ? (
                <div className="inline-flex flex-col items-stretch self-start gap-0">
                  {scopeList.map((scope) => {
                    const isActive = selectedScope?.id === scope.id;

                    return (
                      <button
                        key={scope.id}
                        type="button"
                        role="menuitem"
                        onClick={() => void handleScopeSelect(scope.id)}
                        disabled={switchingScopeId !== null}
                        className={optionClass(isActive)}
                      >
                        <span className="min-w-0 truncate">
                          {getScopeDisplayName(scope)}
                        </span>
                      </button>
                    );
                  })}

                  {scopeList.length === 0 ? (
                    <p className="m-0 px-4 py-2.5 text-sm text-[var(--color-text-subtle)]">
                      {copy.emptyScopeList}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
