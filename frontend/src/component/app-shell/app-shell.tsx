import type { ReactNode } from "react";

import { AppSidebar } from "@/component/app-shell/app-sidebar";
import { AppTopbar } from "@/component/app-shell/app-topbar";

type NavigationItem = {
  key: string;
  label: string;
  href?: string;
  statusLabel?: string;
};

type AppShellProps = {
  children: ReactNode;
  productName: string;
  productStage: string;
  workspaceLabel: string;
  navigationItemList: NavigationItem[];
  localeLabel: string;
  localeValue: string;
  statusLabel: string;
  statusValue: string;
  topbarActionSlot?: ReactNode;
};

export function AppShell({
  children,
  productName,
  productStage,
  workspaceLabel,
  navigationItemList,
  localeLabel,
  localeValue,
  statusLabel,
  statusValue,
  topbarActionSlot
}: AppShellProps) {
  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-50">
      <AppSidebar
        productName={productName}
        productStage={productStage}
        workspaceLabel={workspaceLabel}
        navigationItemList={navigationItemList}
      />

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <AppTopbar
          localeLabel={localeLabel}
          localeValue={localeValue}
          statusLabel={statusLabel}
          statusValue={statusValue}
          actionSlot={topbarActionSlot}
        />

        <main className="flex-1 overflow-auto">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
