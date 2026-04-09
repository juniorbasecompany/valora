"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
    ActionChecklistIcon,
    DashboardIcon,
    EventFactPathIcon,
    EventStandardPathIcon,
    ItemIcon,
    LocationIcon,
    RulerIcon,
    UnityIcon,
    ValoraMark
} from "@/component/ui/ui-icons";

type NavigationItem = {
    key: string;
    label: string;
    href: string;
};

type NavigationIconKind =
    | "home"
    | "location"
    | "item"
    | "field"
    | "action"
    | "unity"
    | "event"
    | "eventStandard"
    | "eventFact"
    | "calculation";

function CalculationIcon({ className }: { className?: string }) {
    return (
        <svg
            className={["ui-icon", className].filter(Boolean).join(" ")}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
        >
            <rect x="3.5" y="3.5" width="17" height="17" rx="1.5" />
            <path d="M3.5 7.5h17" />
            <path d="M9.2 7.5v13" />
            <path d="M14.8 7.5v13" />
            <path d="M3.5 11.8h17" />
            <path d="M3.5 16.1h17" />
            <rect x="4.9" y="8.9" width="2.9" height="1.6" rx=".35" fill="currentColor" stroke="none" />
        </svg>
    );
}

function SidebarNavigationIcon({
    kind,
    className
}: {
    kind: NavigationIconKind;
    className?: string;
}) {
    switch (kind) {
        case "home":
            return <DashboardIcon className={className} />;
        case "location":
            return <LocationIcon className={className} />;
        case "item":
            return <ItemIcon className={className} />;
        case "field":
            return <RulerIcon className={className} />;
        case "action":
            return <ActionChecklistIcon className={className} />;
        case "unity":
            return <UnityIcon className={className} />;
        case "event":
        case "eventFact":
            return <EventFactPathIcon className={className} />;
        case "eventStandard":
            return <EventStandardPathIcon className={className} />;
        case "calculation":
            return <CalculationIcon className={className} />;
        default:
            return <DashboardIcon className={className} />;
    }
}

type AppSidebarProps = {
    productName: string;
    workspaceLabel: string;
    workspaceSlot?: ReactNode;
    navigationItemList: NavigationItem[];
    accountSlot?: ReactNode;
    mode?: "desktop" | "drawer";
    onNavigate?: () => void;
};

export function AppSidebar({
    productName,
    workspaceLabel,
    workspaceSlot,
    navigationItemList,
    accountSlot,
    mode = "desktop",
    onNavigate
}: AppSidebarProps) {
    const pathname = usePathname();
    const isDrawer = mode === "drawer";

    return (
        <aside
            className={`ui-sidebar ui-shell-sidebar-frame ${isDrawer ? "" : "ui-shell-sidebar"}`}
        >
            <div className="ui-shell-sidebar-header">
                <div className="ui-menu-root">
                    <div className="ui-shell-brand">
                        <div className="ui-shell-brand-copy">
                            <h1 className="ui-header-title ui-shell-brand-title">
                                {productName}
                            </h1>
                        </div>

                        <div className="ui-shell-brand-mark">
                            <ValoraMark />
                        </div>
                    </div>

                    <div className="ui-shell-sidebar-stack">
                        {workspaceSlot ? (
                            <div className="ui-shell-workspace-slot">
                                {workspaceSlot}
                            </div>
                        ) : (
                            <p className="ui-shell-workspace">
                                {workspaceLabel}
                            </p>
                        )}

                        {accountSlot ? (
                            <div className="ui-shell-account-slot">
                                {accountSlot}
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>

            <nav className="ui-sidebar-navigation">
                {navigationItemList.map((navigationItem) => {
                    const navigationIconKind = navigationItem.key as NavigationIconKind;
                    const isHomeItem = navigationItem.key === "home";
                    const isActive = isHomeItem
                        ? pathname === navigationItem.href
                        : pathname === navigationItem.href ||
                        pathname.startsWith(`${navigationItem.href}/`);

                    return (
                        <Link
                            key={navigationItem.key}
                            href={navigationItem.href}
                            aria-current={isActive ? "page" : undefined}
                            onClick={onNavigate}
                            className={`ui-nav-item ${isActive
                                    ? "ui-nav-item-active"
                                    : ""
                                }`}
                        >
                            <span className="ui-nav-item-icon">
                                <SidebarNavigationIcon
                                    kind={navigationIconKind}
                                    className="ui-icon"
                                />
                            </span>
                            <span className="ui-nav-item-label">
                                {navigationItem.label}
                            </span>
                        </Link>
                    );
                })}
            </nav>
        </aside>
    );
}
