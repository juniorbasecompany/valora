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
            ? "ui-menu-panel ui-menu-panel-start ui-menu-panel-narrow ui-menu-panel-floating"
            : "ui-menu-panel ui-menu-panel-start ui-menu-panel-narrow";

    return (
        <div ref={containerRef} className="ui-menu-root-fill">
            <div className="ui-menu-row">
                <div
                    className={isSidebar ? "ui-menu-account-anchor-sidebar" : "ui-menu-account-anchor-default"}
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
                        className={`ui-account-trigger ${isSidebar
                                ? "ui-account-trigger-sidebar"
                                : "ui-menu-trigger ui-account-trigger-default"
                            }`}
                    >
                        {!isSidebar ? (
                            <span className="ui-avatar ui-shrink-0">
                                {getInitials(accountName)}
                            </span>
                        ) : null}
                        <span className={isSidebar ? "ui-account-summary-sidebar" : "ui-account-summary"}>
                            <span
                                className={`ui-account-name ${isSidebar
                                        ? "ui-account-name-sidebar"
                                        : "ui-account-name-default"
                                    }`}
                            >
                                {accountName}
                            </span>
                        </span>
                        <ChevronDownIcon
                            className={`ui-account-chevron ${isSidebar ? "ui-account-chevron-sidebar" : "ui-account-chevron-default"}`}
                        />
                    </button>

                    {isAccountMenuOpen ? (
                        <div role="menu" aria-label={accountName} className={panelClassName}>
                            <div className="ui-menu-list">
                                <Link
                                    href={configurationHref}
                                    role="menuitem"
                                    onClick={() => setActiveMenu(null)}
                                    className="ui-menu-item"
                                >
                                    {copy.configurationLabel}
                                </Link>

                                <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => void handleSignOut()}
                                    disabled={isSigningOut}
                                    className="ui-menu-item"
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
                    className={isSidebar ? "ui-menu-flag-anchor-sidebar" : "ui-menu-flag-anchor-default"}
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
