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
  tenantLabel: string;
  tenantValue: string;
  localeLabel: string;
  localeValue: string;
  accountLabel?: string;
  accountValue?: string;
  topbarActionSlot?: ReactNode;
};

export function AppShell({
  children,
  productName,
  productStage,
  workspaceLabel,
  navigationItemList,
  tenantLabel,
  tenantValue,
  localeLabel,
  localeValue,
  accountLabel,
  accountValue,
  topbarActionSlot
}: AppShellProps) {
  return (
    <div className="ui-shell flex min-h-screen">
      <AppSidebar
        productName={productName}
        productStage={productStage}
        workspaceLabel={workspaceLabel}
        navigationItemList={navigationItemList}
      />

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <AppTopbar
          tenantLabel={tenantLabel}
          tenantValue={tenantValue}
          localeLabel={localeLabel}
          localeValue={localeValue}
          accountLabel={accountLabel}
          accountValue={accountValue}
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
