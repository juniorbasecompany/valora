"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  googleIdTokenStorageKey,
  tenantSelectionStorageKey
} from "@/lib/auth/session";
import type {
  InviteOption,
  TenantOption,
  TenantSelectionSnapshot
} from "@/lib/auth/types";

type TenantSelectionCopy = {
  loading: string;
  title: string;
  description: string;
  activeListTitle: string;
  inviteListTitle: string;
  createTitle: string;
  createDescription: string;
  createAction: string;
  createPending: string;
  acceptAction: string;
  rejectAction: string;
  selectAction: string;
  processing: string;
  empty: string;
  backToLogin: string;
  genericError: string;
};

type TenantSelectionPanelProps = {
  locale: string;
  copy: TenantSelectionCopy;
};

const emptyTenantList: TenantOption[] = [];
const emptyInviteList: InviteOption[] = [];

function getRoleLabel(role: number) {
  if (role === 1) {
    return "master";
  }
  if (role === 2) {
    return "admin";
  }
  if (role === 3) {
    return "member";
  }
  return "unknown";
}

function getTenantDisplayName(option: TenantOption | InviteOption) {
  return option.display_name || option.name;
}

export function TenantSelectionPanel({
  locale,
  copy
}: TenantSelectionPanelProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<TenantSelectionSnapshot | null>(null);

  const tenantList = snapshot?.tenant_list ?? emptyTenantList;
  const inviteList = snapshot?.invite_list ?? emptyInviteList;
  const nextAction = snapshot?.next_action ?? null;

  const readSnapshot = useCallback(() => {
    const snapshotValue = sessionStorage.getItem(tenantSelectionStorageKey);
    if (!snapshotValue) {
      router.replace(`/${locale}/login?reason=auth_required`);
      return null;
    }

    try {
      return JSON.parse(snapshotValue) as TenantSelectionSnapshot;
    } catch {
      sessionStorage.removeItem(tenantSelectionStorageKey);
      sessionStorage.removeItem(googleIdTokenStorageKey);
      router.replace(`/${locale}/login?reason=auth_required`);
      return null;
    }
  }, [locale, router]);

  const persistSnapshot = useCallback((nextSnapshot: TenantSelectionSnapshot) => {
    setSnapshot(nextSnapshot);
    sessionStorage.setItem(
      tenantSelectionStorageKey,
      JSON.stringify(nextSnapshot)
    );
  }, []);

  const clearSelectionState = useCallback(() => {
    sessionStorage.removeItem(tenantSelectionStorageKey);
    sessionStorage.removeItem(googleIdTokenStorageKey);
  }, []);

  const getGoogleIdToken = useCallback(() => {
    const token = sessionStorage.getItem(googleIdTokenStorageKey);
    if (!token) {
      router.replace(`/${locale}/login?reason=auth_required`);
      return null;
    }

    return token;
  }, [locale, router]);

  const handleCreateTenant = useCallback(async () => {
    const googleIdToken = getGoogleIdToken();
    if (!googleIdToken) {
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/auth/google/create-tenant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ id_token: googleIdToken })
      });
      const data = (await response.json()) as { detail?: string };
      if (!response.ok) {
        setErrorMessage(data.detail || copy.genericError);
        setIsProcessing(false);
        return;
      }

      clearSelectionState();
      router.replace(`/${locale}/app`);
    } catch {
      setErrorMessage(copy.genericError);
      setIsProcessing(false);
    }
  }, [clearSelectionState, copy.genericError, getGoogleIdToken, locale, router]);

  const handleSelectTenant = useCallback(
    async (tenantId: number) => {
      const googleIdToken = getGoogleIdToken();
      if (!googleIdToken) {
        return;
      }

      setIsProcessing(true);
      setErrorMessage(null);

      try {
        const response = await fetch("/api/auth/google/select-tenant", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            id_token: googleIdToken,
            tenant_id: tenantId
          })
        });
        const data = (await response.json()) as { detail?: string };
        if (!response.ok) {
          setErrorMessage(data.detail || copy.genericError);
          setIsProcessing(false);
          return;
        }

        clearSelectionState();
        router.replace(`/${locale}/app`);
      } catch {
        setErrorMessage(copy.genericError);
        setIsProcessing(false);
      }
    },
    [clearSelectionState, copy.genericError, getGoogleIdToken, locale, router]
  );

  const handleAcceptInvite = useCallback(
    async (invite: InviteOption) => {
      const googleIdToken = getGoogleIdToken();
      if (!googleIdToken) {
        return;
      }

      setIsProcessing(true);
      setErrorMessage(null);

      try {
        const tokenResponse = await fetch("/api/auth/google/select-tenant", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            id_token: googleIdToken,
            tenant_id: invite.tenant_id
          })
        });
        const tokenData = (await tokenResponse.json()) as { detail?: string };
        if (!tokenResponse.ok) {
          setErrorMessage(tokenData.detail || copy.genericError);
          setIsProcessing(false);
          return;
        }

        const acceptResponse = await fetch(
          `/api/auth/invites/${invite.member_id}/accept`,
          {
            method: "POST"
          }
        );
        const acceptData = (await acceptResponse.json()) as { detail?: string };
        if (!acceptResponse.ok) {
          setErrorMessage(acceptData.detail || copy.genericError);
          setIsProcessing(false);
          return;
        }

        const finalResponse = await fetch("/api/auth/google/select-tenant", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            id_token: googleIdToken,
            tenant_id: invite.tenant_id
          })
        });
        const finalData = (await finalResponse.json()) as { detail?: string };
        if (!finalResponse.ok) {
          setErrorMessage(finalData.detail || copy.genericError);
          setIsProcessing(false);
          return;
        }

        clearSelectionState();
        router.replace(`/${locale}/app`);
      } catch {
        setErrorMessage(copy.genericError);
        setIsProcessing(false);
      }
    },
    [clearSelectionState, copy.genericError, getGoogleIdToken, locale, router]
  );

  const handleRejectInvite = useCallback(
    async (invite: InviteOption) => {
      const googleIdToken = getGoogleIdToken();
      if (!googleIdToken) {
        return;
      }

      setIsProcessing(true);
      setErrorMessage(null);

      try {
        const tokenResponse = await fetch("/api/auth/google/select-tenant", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            id_token: googleIdToken,
            tenant_id: invite.tenant_id
          })
        });
        const tokenData = (await tokenResponse.json()) as { detail?: string };
        if (!tokenResponse.ok) {
          setErrorMessage(tokenData.detail || copy.genericError);
          setIsProcessing(false);
          return;
        }

        const rejectResponse = await fetch(
          `/api/auth/invites/${invite.member_id}/reject`,
          {
            method: "POST"
          }
        );
        const rejectData = (await rejectResponse.json()) as { detail?: string };
        if (!rejectResponse.ok) {
          setErrorMessage(rejectData.detail || copy.genericError);
          setIsProcessing(false);
          return;
        }

        const nextInviteList = inviteList.filter(
          (inviteItem) => inviteItem.member_id !== invite.member_id
        );
        const nextSnapshot: TenantSelectionSnapshot = {
          tenant_list: tenantList,
          invite_list: nextInviteList,
          next_action:
            tenantList.length === 0 && nextInviteList.length === 0
              ? "create_tenant"
              : nextAction
        };
        persistSnapshot(nextSnapshot);
        setIsProcessing(false);
      } catch {
        setErrorMessage(copy.genericError);
        setIsProcessing(false);
      }
    },
    [
      copy.genericError,
      getGoogleIdToken,
      inviteList,
      nextAction,
      persistSnapshot,
      tenantList
    ]
  );

  useEffect(() => {
    const currentSnapshot = readSnapshot();
    if (!currentSnapshot) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setSnapshot(currentSnapshot);
      setIsLoading(false);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [readSnapshot]);

  useEffect(() => {
    if (
      !snapshot ||
      isProcessing ||
      nextAction !== "create_tenant" ||
      tenantList.length > 0 ||
      inviteList.length > 0
    ) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void handleCreateTenant();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [
    handleCreateTenant,
    inviteList.length,
    isProcessing,
    nextAction,
    snapshot,
    tenantList.length
  ]);

  const isCreateFlow = useMemo(
    () => tenantList.length === 0 && inviteList.length === 0,
    [inviteList.length, tenantList.length]
  );

  if (isLoading) {
    return (
      <div className="ui-panel px-6 py-6 text-sm text-[var(--color-text-subtle)]">
        {copy.loading}
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="ui-panel px-6 py-6">
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--color-text)]">
            {copy.title}
          </h1>
          <p className="max-w-2xl text-sm leading-7 text-[var(--color-text-muted)]">
            {copy.description}
          </p>
        </div>
      </header>

      {errorMessage ? (
        <div className="ui-notice-attention px-4 py-3 text-sm">{errorMessage}</div>
      ) : null}

      {isCreateFlow ? (
        <article className="ui-card flex flex-col gap-4 p-5">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-[var(--color-text)]">
              {copy.createTitle}
            </h2>
            <p className="text-sm leading-6 text-[var(--color-text-subtle)]">
              {copy.createDescription}
            </p>
          </div>
          <div>
            <button
              type="button"
              onClick={() => void handleCreateTenant()}
              disabled={isProcessing}
              className="ui-button-primary inline-flex items-center text-sm font-medium transition disabled:opacity-60"
            >
              {isProcessing ? copy.createPending : copy.createAction}
            </button>
          </div>
        </article>
      ) : null}

      {tenantList.length > 0 ? (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold tracking-tight text-[var(--color-text)]">
            {copy.activeListTitle}
          </h2>
          <div className="grid gap-4">
            {tenantList.map((tenant) => (
              <article key={tenant.tenant_id} className="ui-card p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-2">
                    <h3 className="text-base font-semibold text-[var(--color-text)]">
                      {getTenantDisplayName(tenant)}
                    </h3>
                    <p className="text-sm text-[var(--color-text-subtle)]">
                      {getRoleLabel(tenant.role)}
                    </p>
                  </div>
                  <div>
                    <button
                      type="button"
                      onClick={() => void handleSelectTenant(tenant.tenant_id)}
                      disabled={isProcessing}
                      className="ui-button-secondary inline-flex items-center text-sm font-medium transition disabled:opacity-60"
                    >
                      {isProcessing ? copy.processing : copy.selectAction}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {inviteList.length > 0 ? (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold tracking-tight text-[var(--color-text)]">
            {copy.inviteListTitle}
          </h2>
          <div className="grid gap-4">
            {inviteList.map((invite) => (
              <article key={invite.member_id} className="ui-card p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-2">
                    <h3 className="text-base font-semibold text-[var(--color-text)]">
                      {getTenantDisplayName(invite)}
                    </h3>
                    <p className="text-sm text-[var(--color-text-subtle)]">
                      {getRoleLabel(invite.role)} • {invite.status}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => void handleAcceptInvite(invite)}
                      disabled={isProcessing}
                      className="ui-button-primary inline-flex items-center text-sm font-medium transition disabled:opacity-60"
                    >
                      {isProcessing ? copy.processing : copy.acceptAction}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleRejectInvite(invite)}
                      disabled={isProcessing}
                      className="ui-button-secondary inline-flex items-center text-sm font-medium transition disabled:opacity-60"
                    >
                      {isProcessing ? copy.processing : copy.rejectAction}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {!isCreateFlow && tenantList.length === 0 && inviteList.length === 0 ? (
        <div className="ui-panel px-6 py-6 text-sm text-[var(--color-text-subtle)]">
          {copy.empty}
        </div>
      ) : null}

      <div>
        <button
          type="button"
          onClick={() => {
            clearSelectionState();
            router.replace(`/${locale}/login`);
          }}
          className="ui-link text-sm underline underline-offset-4"
        >
          {copy.backToLogin}
        </button>
      </div>
    </section>
  );
}
