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
    <aside className="flex w-full max-w-72 shrink-0 flex-col border-r border-slate-800 bg-slate-950/95">
      <div className="border-b border-slate-800 px-5 py-5">
        <div className="flex flex-col gap-2">
          <span className="inline-flex w-fit rounded-full border border-slate-800 bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-300">
            {productStage}
          </span>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-white">
              {productName}
            </h1>
            <p className="mt-1 text-sm text-slate-400">{workspaceLabel}</p>
          </div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-2 px-3 py-4">
        {navigationItemList.map((navigationItem) => {
          const content = (
            <>
              <span>{navigationItem.label}</span>
              {navigationItem.statusLabel ? (
                <span className="rounded-full border border-slate-800 px-2 py-0.5 text-[11px] text-slate-400">
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
                className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm transition ${
                  isActive
                    ? "bg-slate-800 text-white"
                    : "text-slate-300 hover:bg-slate-900 hover:text-white"
                }`}
              >
                {content}
              </Link>
            );
          }

          return (
            <div
              key={navigationItem.key}
              className="flex items-center justify-between rounded-xl px-3 py-2.5 text-sm text-slate-500"
            >
              {content}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
