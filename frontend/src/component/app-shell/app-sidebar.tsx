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

type NavigationIconKind =
  | "home"
  | "operation"
  | "record"
  | "import"
  | "process"
  | "audit";

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
      className={`ui-sidebar flex h-full w-full min-w-0 shrink-0 flex-col ${
        isDrawer
          ? ""
          : "max-w-[19.5rem] border-r border-[var(--color-border)]"
      }`}
    >
      <div className="relative z-20 overflow-visible border-b border-[var(--color-border)] px-5 py-6">
        <div className="relative">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="ui-header-title text-[2.15rem] font-semibold tracking-[-0.04em] leading-none text-[var(--color-text)]">
                {productName}
              </h1>
            </div>

            <div className="shrink-0 self-start">
              <ValoraMark />
            </div>
          </div>

          <div className="mt-3 min-w-0">
            {workspaceSlot ? (
              <div className="max-w-full">
                {workspaceSlot}
              </div>
            ) : (
              <p className="max-w-[14rem] text-[1.04rem] font-medium leading-6 text-[var(--color-text)]">
                {workspaceLabel}
              </p>
            )}

            {accountSlot ? (
              <div className="mt-3.5 max-w-full">
                {accountSlot}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <nav className="relative z-0 flex flex-1 flex-col gap-0 overflow-y-auto px-0 py-0">
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
              className={`ui-nav-item rounded-none border-0 shadow-none flex items-center gap-3 px-4 py-2.5 text-sm ${
                isActive
                  ? "ui-nav-item-active"
                  : ""
              }`}
            >
              <span className="ui-nav-item-icon">
                <NavigationIcon
                  kind={navigationIconKind}
                  className="h-[1.1rem] w-[1.1rem]"
                />
              </span>
              <span className="min-w-0 truncate text-sm">
                {navigationItem.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
