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
  return tenant.name;
}

function getScopeDisplayName(scope: TenantScopeRecord) {
  return scope.name.trim() || `#${scope.id}`;
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
    `ui-menu-item ${
      isActive ? "ui-menu-item-active" : ""
    }`;

  return (
    <div ref={containerRef} className="ui-menu-root ui-fill-width">
      <div className="ui-workspace-menu-row">
        <div className="ui-workspace-menu-anchor">
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
            className="ui-menu-inline-trigger"
          >
            <span className="ui-menu-inline-label">{currentTenantName}</span>
            <ChevronDownIcon className="ui-menu-inline-chevron" />
          </button>

          {isTenantMenuOpen ? (
            <div
              role="menu"
              aria-label={copy.tenantMenuAriaLabel}
              className="ui-menu-panel ui-menu-panel-start ui-menu-panel-wide ui-menu-panel-context"
            >
              {isLoadingTenantList || switchingTenantId !== null ? (
                <div className="ui-menu-feedback">
                  <span className="ui-menu-feedback-label">
                    {isLoadingTenantList
                      ? copy.loadingTenantList
                      : copy.switchingTenant}
                  </span>
                </div>
              ) : null}

              {tenantListError ? (
                <p className="ui-menu-feedback-danger">
                  {tenantListError}
                </p>
              ) : null}

              {!isLoadingTenantList && !tenantListError ? (
                <div className="ui-menu-list">
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
                        <span className="ui-menu-label">
                          {getTenantDisplayName(tenant)}
                        </span>
                      </button>
                    );
                  })}

                  {tenantList.length === 0 ? (
                    <p className="ui-menu-empty">
                      {copy.emptyTenantList}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="ui-workspace-menu-anchor-end">
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
            className="ui-menu-inline-trigger"
          >
            <span className="ui-menu-inline-label ui-menu-inline-label-end">
              {selectedScope ? getScopeDisplayName(selectedScope) : copy.noScopeLabel}
            </span>
            <ChevronDownIcon className="ui-menu-inline-chevron" />
          </button>

          {isScopeMenuOpen ? (
            <div
              role="menu"
              aria-label={copy.scopeMenuAriaLabel}
              className="ui-menu-panel ui-menu-panel-start ui-menu-panel-wide ui-menu-panel-context"
            >
              {isLoadingScopeList || switchingScopeId !== null ? (
                <div className="ui-menu-feedback">
                  <span className="ui-menu-feedback-label">
                    {isLoadingScopeList
                      ? copy.loadingScopeList
                      : copy.switchingScope}
                  </span>
                </div>
              ) : null}

              {scopeListError ? (
                <p className="ui-menu-feedback-danger">
                  {scopeListError}
                </p>
              ) : null}

              {!isLoadingScopeList && !scopeListError ? (
                <div className="ui-menu-list">
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
                        <span className="ui-menu-label">
                          {getScopeDisplayName(scope)}
                        </span>
                      </button>
                    );
                  })}

                  {scopeList.length === 0 ? (
                    <p className="ui-menu-empty">
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
