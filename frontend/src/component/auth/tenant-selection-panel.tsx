"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  googleIdTokenStorageKey,
  rememberMeChoiceStorageKey,
  tenantSelectionStorageKey
} from "@/lib/auth/session";
import type {
  InviteOption,
  TenantOption,
  TenantSelectionSnapshot
} from "@/lib/auth/types";
import {
  BuildingIcon,
  ClockIcon,
  SparkIcon,
  ValoraMark
} from "@/component/ui/ui-icons";
import { Badge } from "@/component/ui/badge";

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

function getRememberMeForApi() {
  return sessionStorage.getItem(rememberMeChoiceStorageKey) === "1";
}

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

function getRoleTone(role: number): "positive" | "neutral" | "construction" {
  if (role === 1) {
    return "positive";
  }
  if (role === 2) {
    return "neutral";
  }
  return "construction";
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
      sessionStorage.removeItem(rememberMeChoiceStorageKey);
      router.replace(`/${locale}/login?reason=auth_required`);
      return null;
    }

    try {
      return JSON.parse(snapshotValue) as TenantSelectionSnapshot;
    } catch {
      sessionStorage.removeItem(tenantSelectionStorageKey);
      sessionStorage.removeItem(googleIdTokenStorageKey);
      sessionStorage.removeItem(rememberMeChoiceStorageKey);
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
    sessionStorage.removeItem(rememberMeChoiceStorageKey);
  }, []);

  const getGoogleIdToken = useCallback(() => {
    const token = sessionStorage.getItem(googleIdTokenStorageKey);
    if (!token) {
      sessionStorage.removeItem(rememberMeChoiceStorageKey);
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
        body: JSON.stringify({
          id_token: googleIdToken,
          remember_me: getRememberMeForApi()
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
            tenant_id: tenantId,
            remember_me: getRememberMeForApi()
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
            tenant_id: invite.tenant_id,
            remember_me: getRememberMeForApi()
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
            tenant_id: invite.tenant_id,
            remember_me: getRememberMeForApi()
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
            tenant_id: invite.tenant_id,
            remember_me: getRememberMeForApi()
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
      <div className="ui-panel ui-empty-panel">
        {copy.loading}
      </div>
    );
  }

  return (
    <section className="ui-page-stack">
      <header className="ui-panel ui-auth-selection-header">
        <div className="ui-row-start-lg">
          <div className="ui-auth-mark">
            <ValoraMark />
          </div>
          <div className="ui-section-copy">
            <h1 className="ui-header-title ui-title-page ui-title-page-section">
              {copy.title}
            </h1>
            <p className="ui-page-description ui-copy-limit-wide">
              {copy.description}
            </p>
          </div>
        </div>
      </header>

      {errorMessage ? (
        <div className="ui-notice-attention ui-notice-block">{errorMessage}</div>
      ) : null}

      {isCreateFlow ? (
        <article className="ui-panel ui-auth-card">
          <div className="ui-section-header">
            <span className="ui-icon-badge">
              <SparkIcon className="ui-icon-sm" />
            </span>
            <div className="ui-section-copy">
              <h2 className="ui-header-title ui-title-section-lg">
                {copy.createTitle}
              </h2>
              <p className="ui-copy-body">
                {copy.createDescription}
              </p>
            </div>
          </div>
          <div>
            <button
              type="button"
              onClick={() => void handleCreateTenant()}
              disabled={isProcessing}
              className="ui-button-primary"
            >
              {isProcessing ? copy.createPending : copy.createAction}
            </button>
          </div>
        </article>
      ) : null}

      {tenantList.length > 0 ? (
        <section className="ui-panel ui-auth-selection-card">
          <div className="ui-section-header ui-section-header-center">
            <span className="ui-icon-badge">
              <BuildingIcon className="ui-icon-sm" />
            </span>
            <div className="ui-section-copy">
              <h2 className="ui-header-title ui-title-section-lg">
                {copy.activeListTitle}
              </h2>
            </div>
          </div>
          <div className="ui-preview-stack">
            {tenantList.map((tenant) => (
              <article
                key={tenant.tenant_id}
                className="ui-preview-card ui-preview-card-accent ui-stack-lg"
              >
                <div className="ui-preview-card-row">
                  <div className="ui-preview-card-copy">
                    <h3 className="ui-header-title ui-title-section">
                      {getTenantDisplayName(tenant)}
                    </h3>
                    <Badge tone={getRoleTone(tenant.role)}>
                      {getRoleLabel(tenant.role)}
                    </Badge>
                  </div>
                  <div>
                    <button
                      type="button"
                      onClick={() => void handleSelectTenant(tenant.tenant_id)}
                      disabled={isProcessing}
                      className="ui-button-secondary"
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
        <section className="ui-panel ui-auth-selection-card">
          <div className="ui-section-header ui-section-header-center">
            <span className="ui-icon-badge ui-icon-badge-attention">
              <ClockIcon className="ui-icon-sm" />
            </span>
            <div className="ui-section-copy">
              <h2 className="ui-header-title ui-title-section-lg">
                {copy.inviteListTitle}
              </h2>
            </div>
          </div>
          <div className="ui-preview-stack">
            {inviteList.map((invite) => (
              <article
                key={invite.member_id}
                className="ui-preview-card ui-stack-lg"
              >
                <div className="ui-preview-card-row">
                  <div className="ui-preview-card-copy">
                    <h3 className="ui-header-title ui-title-section">
                      {getTenantDisplayName(invite)}
                    </h3>
                    <div className="ui-badge-row">
                      <Badge tone={getRoleTone(invite.role)}>
                        {getRoleLabel(invite.role)}
                      </Badge>
                      <Badge tone="construction">
                        {invite.status}
                      </Badge>
                    </div>
                  </div>
                  <div className="ui-button-row">
                    <button
                      type="button"
                      onClick={() => void handleAcceptInvite(invite)}
                      disabled={isProcessing}
                      className="ui-button-primary"
                    >
                      {isProcessing ? copy.processing : copy.acceptAction}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleRejectInvite(invite)}
                      disabled={isProcessing}
                      className="ui-button-secondary"
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
        <div className="ui-panel ui-empty-panel">
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
          className="ui-link ui-auth-selection-back"
        >
          {copy.backToLogin}
        </button>
      </div>
    </section>
  );
}
