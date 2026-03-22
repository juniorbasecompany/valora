"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { NavigationIcon, ValoraMark } from "@/component/ui/ui-icons";

type NavigationItem = {
  key: string;
  label: string;
  href?: string;
  statusLabel?: string;
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
  navigationItemList: NavigationItem[];
  accountSlot?: ReactNode;
  mode?: "desktop" | "drawer";
  onNavigate?: () => void;
};

export function AppSidebar({
  productName,
  workspaceLabel,
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
        <div className="relative flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="ui-header-title text-[2.15rem] font-semibold tracking-[-0.04em] leading-none text-[var(--color-text)]">
              {productName}
            </h1>
            <p className="mt-3 max-w-[14rem] text-[1.04rem] font-medium leading-6 text-[var(--color-text)]">
              {workspaceLabel}
            </p>

            {accountSlot ? (
              <div className="mt-3.5 max-w-full">
                {accountSlot}
              </div>
            ) : null}
          </div>

          <div className="shrink-0">
            <ValoraMark />
          </div>
        </div>
      </div>

      <nav className="relative z-0 flex flex-1 flex-col gap-2 overflow-y-auto px-3 py-5">
        {navigationItemList.map((navigationItem) => {
          const isPlanned = !navigationItem.href;
          const navigationIconKind = navigationItem.key as NavigationIconKind;
          const content = (
            <>
              <span className="flex min-w-0 items-center gap-3">
                <span
                  className={`ui-icon-badge h-10 w-10 rounded-[0.72rem] ${
                    isPlanned
                      ? "ui-icon-badge-construction"
                      : ""
                  }`}
                >
                  <NavigationIcon
                    kind={navigationIconKind}
                    className="h-[1.05rem] w-[1.05rem]"
                  />
                </span>
                <span className="min-w-0 truncate text-sm font-medium">
                  {navigationItem.label}
                </span>
              </span>
              {navigationItem.statusLabel ? (
                <span
                  className={`ui-pill px-2.5 py-1 text-[11px] font-semibold ${
                    isPlanned
                      ? "ui-pill-construction"
                      : ""
                  }`}
                >
                  {navigationItem.statusLabel}
                </span>
              ) : null}
            </>
          );

          if (navigationItem.href) {
            const isActive =
              pathname === navigationItem.href ||
              (navigationItem.href !== "/" &&
                pathname.startsWith(`${navigationItem.href}/`));

            return (
              <Link
                key={navigationItem.key}
                href={navigationItem.href}
                onClick={onNavigate}
                className={`ui-nav-item flex items-center justify-between gap-3 px-3 py-3 text-sm ${
                  isActive
                    ? "ui-nav-item-active"
                    : ""
                }`}
              >
                {content}
              </Link>
            );
          }

          return (
            <div
              key={navigationItem.key}
              className="ui-nav-item ui-nav-item-coming-soon ui-nav-item-muted flex items-center justify-between gap-3 px-3 py-3 text-sm"
            >
              {content}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
