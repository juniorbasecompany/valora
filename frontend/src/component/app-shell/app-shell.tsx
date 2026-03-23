import type { ReactNode } from "react";

import { AppSidebar } from "@/component/app-shell/app-sidebar";
import { MobileShellNav } from "@/component/app-shell/mobile-shell-nav";

type NavigationItem = {
  key: string;
  label: string;
  href: string;
};

type AppShellProps = {
  children: ReactNode;
  productName: string;
  workspaceLabel: string;
  mobileWorkspaceLabel?: string;
  workspaceSlot?: ReactNode;
  navigationItemList: NavigationItem[];
  mobileNavigationOpenLabel: string;
  mobileNavigationCloseLabel: string;
  accountSlot?: ReactNode;
};

export function AppShell({
  children,
  productName,
  workspaceLabel,
  mobileWorkspaceLabel,
  workspaceSlot,
  navigationItemList,
  mobileNavigationOpenLabel,
  mobileNavigationCloseLabel,
  accountSlot
}: AppShellProps) {
  return (
    <div className="ui-shell ui-shell-frame">
      <div className="ui-shell-desktop-sidebar">
        <AppSidebar
          productName={productName}
          workspaceLabel={workspaceLabel}
          workspaceSlot={workspaceSlot}
          navigationItemList={navigationItemList}
          accountSlot={accountSlot}
        />
      </div>

      <div className="ui-shell-main">
        <div className="ui-shell-mobile-anchor">
          <MobileShellNav
            productName={productName}
            workspaceLabel={mobileWorkspaceLabel ?? workspaceLabel}
            workspaceSlot={workspaceSlot}
            navigationItemList={navigationItemList}
            accountSlot={accountSlot}
            openLabel={mobileNavigationOpenLabel}
            closeLabel={mobileNavigationCloseLabel}
          />
        </div>

        <main className="ui-scroll-stable ui-shell-main-scroll">
          <div className="ui-shell-content">
            {children}
          </div>
        </main>

        <footer
          id="app-shell-footer-slot"
          className="ui-shell-footer"
        />
      </div>
    </div>
  );
}
