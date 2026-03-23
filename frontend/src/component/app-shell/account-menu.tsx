"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { LocaleFlagMenu } from "@/component/i18n/locale-flag-menu";
import {
  googleIdTokenStorageKey,
  rememberMeChoiceStorageKey,
  tenantSelectionStorageKey
} from "@/lib/auth/session";

type AccountMenuCopy = {
  localeFlagTriggerAriaLabel: string;
  localeFlagMenuAriaLabel: string;
  configurationLabel: string;
  switchingLocale: string;
  signOutLabel: string;
  signOutPendingLabel: string;
};

type AccountMenuProps = {
  accountName: string;
  currentLocale: string;
  localeList: string[];
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
  const [isSigningOut, setIsSigningOut] = useState(false);

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

  const panelClassName =
    placement === "sidebar"
      ? "ui-menu-panel absolute left-0 top-[calc(100%+0.375rem)] z-40 inline-flex w-auto max-w-[min(calc(100vw-3rem),18rem)] flex-col gap-0 overflow-hidden rounded-none p-0"
      : "ui-menu-panel absolute left-0 top-[calc(100%+0.375rem)] inline-flex w-auto max-w-[min(calc(100vw-3rem),18rem)] flex-col gap-0 overflow-hidden rounded-none p-0";

  return (
    <div ref={containerRef} className="relative isolate w-full max-w-full">
      <div className="flex w-full max-w-full items-center gap-2">
        <div
          className={`${isSidebar ? "order-2 relative max-w-full shrink-0" : "order-1 relative min-w-0 flex-1"}`}
        >
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
            className={`inline-flex min-w-0 items-center text-sm font-medium text-[var(--color-text)] ${
              isSidebar
                ? "w-auto max-w-full gap-1 rounded-none border-0 bg-transparent px-0 py-0 shadow-none leading-none transition-colors duration-150 hover:text-[var(--color-primary)] focus-visible:text-[var(--color-primary)]"
                : "w-full ui-menu-trigger gap-3 rounded-none pl-2 pr-2.5 sm:pl-2.5 sm:pr-3"
            }`}
          >
            {!isSidebar ? (
              <span className="ui-avatar shrink-0">
                {getInitials(accountName)}
              </span>
            ) : null}
            <span className={`${isSidebar ? "text-left" : "min-w-0 flex-1 text-left"}`}>
              <span
                className={`block truncate text-[var(--color-text)] ${
                  isSidebar
                    ? "max-w-[10rem] text-[0.8rem] font-medium leading-none tracking-[-0.01em]"
                    : "text-sm font-semibold"
                }`}
              >
                {accountName}
              </span>
            </span>
            <ChevronDownIcon
              className={`mt-px shrink-0 ${isSidebar ? "text-[var(--color-text)]" : "text-[var(--color-text-subtle)]"} transition-transform duration-200 ${
                isAccountMenuOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {isAccountMenuOpen ? (
            <div role="menu" aria-label={accountName} className={panelClassName}>
              <div className="inline-flex flex-col items-stretch self-start gap-0">
                <Link
                  href={configurationHref}
                  role="menuitem"
                  onClick={() => setActiveMenu(null)}
                  className="ui-menu-item self-stretch whitespace-nowrap rounded-none border-0 shadow-none inline-flex items-center px-4 py-2.5 text-sm font-medium text-[var(--color-text)]"
                >
                  {copy.configurationLabel}
                </Link>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void handleSignOut()}
                  disabled={isSigningOut}
                  className="ui-menu-item ui-menu-sign-out appearance-none self-stretch whitespace-nowrap rounded-none border-0 shadow-none inline-flex items-center px-4 py-2.5 text-left text-sm font-medium disabled:opacity-60"
                >
                  {isSigningOut
                    ? copy.signOutPendingLabel
                    : copy.signOutLabel}
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div
          className={`${isSidebar ? "order-1 shrink-0 self-end" : "order-2 shrink-0"}`}
        >
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
              switchingLocale: copy.switchingLocale
            }}
          />
        </div>
      </div>
    </div>
  );
}
