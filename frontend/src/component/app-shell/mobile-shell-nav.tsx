"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { AppSidebar } from "@/component/app-shell/app-sidebar";

type NavigationItem = {
  key: string;
  label: string;
  href: string;
};

type MobileShellNavProps = {
  productName: string;
  workspaceLabel: string;
  workspaceSlot?: ReactNode;
  navigationItemList: NavigationItem[];
  accountSlot?: ReactNode;
  openLabel: string;
  closeLabel: string;
};

function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M3.5 5.25H14.5M3.5 9H14.5M3.5 12.75H14.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function MobileShellNav({
  productName,
  workspaceLabel,
  workspaceSlot,
  navigationItemList,
  accountSlot,
  openLabel,
  closeLabel
}: MobileShellNavProps) {
  const [isOpen, setIsOpen] = useState(false);
  const portalTarget =
    typeof document === "undefined" ? null : document.body;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const originalOverflow = document.body.style.overflow;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  return (
    <>
      <div className="ui-mobile-shell-nav">
        <button
          type="button"
          aria-expanded={isOpen}
          aria-label={openLabel}
          aria-controls="mobile-shell-navigation"
          onClick={() => setIsOpen(true)}
          className="ui-menu-trigger ui-mobile-shell-trigger"
        >
          <MenuIcon />
        </button>

        <div className="ui-mobile-shell-workspace">
          <p className="ui-mobile-shell-workspace-text">
            {workspaceLabel}
          </p>
        </div>

        <div className="ui-mobile-shell-product">
          {productName}
        </div>

        <div className="ui-mobile-shell-brandmark">
          V
        </div>
      </div>

      {isOpen && portalTarget
        ? createPortal(
            <div className="ui-mobile-shell-portal">
              <button
                type="button"
                aria-label={closeLabel}
                onClick={() => setIsOpen(false)}
                className="ui-mobile-shell-overlay"
              />

              <div
                id="mobile-shell-navigation"
                className="ui-mobile-shell-drawer"
              >
                <AppSidebar
                  productName={productName}
                  workspaceLabel={workspaceLabel}
                  workspaceSlot={workspaceSlot}
                  navigationItemList={navigationItemList}
                  accountSlot={accountSlot}
                  mode="drawer"
                  onNavigate={() => setIsOpen(false)}
                />
              </div>
            </div>,
            portalTarget
          )
        : null}
    </>
  );
}
