"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { NavigationIcon, ValoraMark } from "@/component/ui/ui-icons";

type NavigationItem = {
    key: string;
    label: string;
    href: string;
};

type NavigationIconKind = "home" | "location" | "item" | "field" | "action" | "event";

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
                                <NavigationIcon
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
