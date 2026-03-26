"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  googleIdTokenStorageKey,
  rememberMeChoiceStorageKey,
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
    __valoraGoogleClientIdInitialized?: string;
    __valoraGoogleCredentialHandler?: (response: { credential?: string }) => void;
  }
}

type GoogleSignInPanelProps = {
  locale: string;
  clientId?: string;
  buttonLabel: string;
  buttonPendingLabel: string;
  helperText?: string;
  unavailableText: string;
  genericErrorText: string;
  rememberMeLabel: string;
};

export function GoogleSignInPanel({
  locale,
  clientId,
  buttonLabel,
  buttonPendingLabel,
  helperText,
  unavailableText,
  genericErrorText,
  rememberMeLabel
}: GoogleSignInPanelProps) {
  const router = useRouter();
  const buttonContainerRef = useRef<HTMLDivElement | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(false);

  const isUnavailable = !clientId;

  const handleCredential = useEffectEvent(
    async (credential: string) => {
      setIsPending(true);
      setErrorMessage(null);

      try {
        sessionStorage.setItem(
          rememberMeChoiceStorageKey,
          rememberMe ? "1" : "0"
        );

        const response = await fetch("/api/auth/google/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            id_token: credential,
            remember_me: rememberMe
          })
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
        sessionStorage.removeItem(rememberMeChoiceStorageKey);
        router.push(`/${locale}/app`);
      } catch {
        setErrorMessage(genericErrorText);
        setIsPending(false);
      }
    },
  );

  const handleGoogleResponse = useEffectEvent(
    ({ credential }: { credential?: string }) => {
      if (!credential) {
        setErrorMessage(genericErrorText);
        return;
      }

      void handleCredential(credential);
    }
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
    window.__valoraGoogleCredentialHandler = handleGoogleResponse;

    const intervalId = window.setInterval(() => {
      if (isCancelled || !window.google || !buttonContainerRef.current) {
        return;
      }

      if (window.__valoraGoogleClientIdInitialized !== nextClientId) {
        window.google.accounts.id.initialize({
          client_id: nextClientId,
          callback: (response) => {
            window.__valoraGoogleCredentialHandler?.(response);
          }
        });
        window.__valoraGoogleClientIdInitialized = nextClientId;
      }

      buttonContainerRef.current.innerHTML = "";
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
      if (window.__valoraGoogleCredentialHandler === handleGoogleResponse) {
        window.__valoraGoogleCredentialHandler = undefined;
      }
      window.google?.accounts.id.cancel();
    };
  }, [clientId, isUnavailable]);

  return (
    <div className="ui-stack-xl">
      <div className="ui-stack-sm">
        {helperText ? (
          <div className="ui-auth-helper">{helperText}</div>
        ) : null}
        {errorMessage ? (
          <div className="ui-notice-attention ui-notice-block">
            {errorMessage}
          </div>
        ) : null}
        {isUnavailable ? (
          <div className="ui-notice-attention ui-notice-block">
            {unavailableText}
          </div>
        ) : null}
      </div>

      <div className="ui-stack-md">
        {!isUnavailable ? (
          <div className="ui-auth-google-slot" aria-busy={!isReady}>
            {!isReady ? (
              <>
                <div
                  className="ui-auth-google-skeleton ui-pulse"
                  aria-hidden
                />
                <span className="ui-sr-only">{buttonLabel}</span>
              </>
            ) : null}
            <div
              ref={buttonContainerRef}
              className="ui-auth-google-button"
              data-pending={isPending ? "true" : undefined}
            />
          </div>
        ) : null}
        {isPending ? (
          <div className="ui-auth-status">
            {buttonPendingLabel}
          </div>
        ) : null}
        <label className="ui-auth-remember">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(event) => setRememberMe(event.target.checked)}
            disabled={isUnavailable || isPending}
            className="ui-auth-checkbox"
          />
          <span>{rememberMeLabel}</span>
        </label>
      </div>
    </div>
  );
}
