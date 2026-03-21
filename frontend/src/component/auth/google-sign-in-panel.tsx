"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  googleIdTokenStorageKey,
  tenantSelectionStorageKey
} from "@/lib/auth/session";
import type {
  AuthResponse,
  TenantSelectionSnapshot
} from "@/lib/auth/types";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
          }) => void;
          renderButton: (
            element: HTMLElement,
            options: {
              theme?: "outline" | "filled_blue" | "filled_black";
              size?: "large" | "medium" | "small";
              text?: "continue_with" | "signin_with" | "signup_with";
              shape?: "rectangular" | "pill" | "circle" | "square";
              width?: number;
            }
          ) => void;
          cancel: () => void;
        };
      };
    };
  }
}

type GoogleSignInPanelProps = {
  locale: string;
  clientId?: string;
  buttonLabel: string;
  buttonPendingLabel: string;
  helperText: string;
  unavailableText: string;
  genericErrorText: string;
};

export function GoogleSignInPanel({
  locale,
  clientId,
  buttonLabel,
  buttonPendingLabel,
  helperText,
  unavailableText,
  genericErrorText
}: GoogleSignInPanelProps) {
  const router = useRouter();
  const buttonContainerRef = useRef<HTMLDivElement | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isUnavailable = useMemo(() => !clientId, [clientId]);

  const handleCredential = useCallback(
    async (credential: string) => {
      setIsPending(true);
      setErrorMessage(null);

      try {
        const response = await fetch("/api/auth/google/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ id_token: credential })
        });
        const data = (await response.json()) as AuthResponse & { detail?: string };

        if (!response.ok) {
          setErrorMessage(data.detail || genericErrorText);
          setIsPending(false);
          return;
        }

        if (data.requires_tenant_selection) {
          const snapshot: TenantSelectionSnapshot = {
            tenant_list: data.tenant_list ?? [],
            invite_list: data.invite_list ?? [],
            next_action: data.next_action ?? null
          };
          sessionStorage.setItem(googleIdTokenStorageKey, credential);
          sessionStorage.setItem(
            tenantSelectionStorageKey,
            JSON.stringify(snapshot)
          );
          router.push(`/${locale}/select-tenant`);
          return;
        }

        sessionStorage.removeItem(googleIdTokenStorageKey);
        sessionStorage.removeItem(tenantSelectionStorageKey);
        router.push(`/${locale}/app`);
      } catch {
        setErrorMessage(genericErrorText);
        setIsPending(false);
      }
    },
    [genericErrorText, locale, router]
  );

  useEffect(() => {
    if (isUnavailable) {
      return;
    }
    const nextClientId = clientId;
    if (!nextClientId) {
      return;
    }

    let isCancelled = false;
    const intervalId = window.setInterval(() => {
      if (isCancelled || !window.google || !buttonContainerRef.current) {
        return;
      }

      buttonContainerRef.current.innerHTML = "";
      window.google.accounts.id.initialize({
        client_id: nextClientId,
        callback: ({ credential }) => {
          if (!credential) {
            setErrorMessage(genericErrorText);
            return;
          }

          void handleCredential(credential);
        }
      });
      window.google.accounts.id.renderButton(buttonContainerRef.current, {
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "pill",
        width: 340
      });
      setIsReady(true);
      window.clearInterval(intervalId);
    }, 200);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
      window.google?.accounts.id.cancel();
    };
  }, [clientId, genericErrorText, handleCredential, isUnavailable]);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="text-sm leading-6 text-[var(--color-text-subtle)]">
          {helperText}
        </div>
        {errorMessage ? (
          <div className="ui-notice-attention px-4 py-3 text-sm">
            {errorMessage}
          </div>
        ) : null}
        {isUnavailable ? (
          <div className="ui-notice-attention px-4 py-3 text-sm">
            {unavailableText}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-3">
        <div
          ref={buttonContainerRef}
          className={`min-h-11 ${isPending ? "pointer-events-none opacity-60" : ""}`}
        />
        {!isReady && !isUnavailable ? (
          <div className="text-sm text-[var(--color-text-subtle)]">{buttonLabel}</div>
        ) : null}
        {isPending ? (
          <div className="text-sm font-medium text-[var(--color-text)]">
            {buttonPendingLabel}
          </div>
        ) : null}
      </div>
    </div>
  );
}
