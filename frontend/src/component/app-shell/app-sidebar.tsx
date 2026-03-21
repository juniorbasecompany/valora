"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavigationItem = {
  key: string;
  label: string;
  href?: string;
  statusLabel?: string;
};

type AppSidebarProps = {
  productName: string;
  productStage: string;
  workspaceLabel: string;
  navigationItemList: NavigationItem[];
};

export function AppSidebar({
  productName,
  productStage,
  workspaceLabel,
  navigationItemList
}: AppSidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="ui-sidebar flex w-full max-w-72 shrink-0 flex-col">
      <div className="border-b border-[var(--color-border)] px-5 py-5">
        <div className="flex flex-col gap-2">
          <span className="ui-pill inline-flex w-fit px-2.5 py-1 text-xs font-medium">
            {productStage}
          </span>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-[var(--color-text)]">
              {productName}
            </h1>
            <p className="mt-1 text-sm text-[var(--color-text-subtle)]">
              {workspaceLabel}
            </p>
          </div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-2 px-3 py-4">
        {navigationItemList.map((navigationItem) => {
          const content = (
            <>
              <span>{navigationItem.label}</span>
              {navigationItem.statusLabel ? (
                <span className="ui-pill px-2 py-0.5 text-[11px]">
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
                className={`ui-nav-item flex items-center justify-between px-3 py-2.5 text-sm transition ${
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
              className="ui-nav-item-muted flex items-center justify-between rounded-[var(--radius-control)] px-3 py-2.5 text-sm"
            >
              {content}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
