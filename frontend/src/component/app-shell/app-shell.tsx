import type { ReactNode } from "react";

import { AppSidebar } from "@/component/app-shell/app-sidebar";
import { MobileShellNav } from "@/component/app-shell/mobile-shell-nav";

type NavigationItem = {
  key: string;
  label: string;
  href?: string;
  statusLabel?: string;
};

type AppShellProps = {
  children: ReactNode;
  productName: string;
  workspaceLabel: string;
  navigationItemList: NavigationItem[];
  mobileNavigationOpenLabel: string;
  mobileNavigationCloseLabel: string;
  accountSlot?: ReactNode;
};

export function AppShell({
  children,
  productName,
  workspaceLabel,
  navigationItemList,
  mobileNavigationOpenLabel,
  mobileNavigationCloseLabel,
  accountSlot
}: AppShellProps) {
  return (
    <div className="ui-shell flex min-h-dvh flex-col overflow-hidden lg:h-screen lg:flex-row">
      <div className="hidden lg:flex lg:h-full lg:max-w-[19.5rem] lg:shrink-0 lg:relative lg:z-40">
        <AppSidebar
          productName={productName}
          workspaceLabel={workspaceLabel}
          navigationItemList={navigationItemList}
          accountSlot={accountSlot}
        />
      </div>

      <div className="relative z-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="fixed left-4 right-4 top-4 z-50 lg:hidden">
          <MobileShellNav
            productName={productName}
            workspaceLabel={workspaceLabel}
            navigationItemList={navigationItemList}
            accountSlot={accountSlot}
            openLabel={mobileNavigationOpenLabel}
            closeLabel={mobileNavigationCloseLabel}
          />
        </div>

        <main className="ui-scroll-stable flex-1 overflow-y-auto overflow-x-hidden">
          <div className="mx-auto flex w-full max-w-[112rem] flex-col gap-6 px-4 pb-5 pt-24 sm:gap-7 sm:px-5 sm:pb-6 sm:pt-28 lg:px-8 lg:py-8">
            {children}
          </div>
        </main>

        <footer
          id="app-shell-footer-slot"
          className="ui-shell-footer empty:hidden"
        />
      </div>
    </div>
  );
}
