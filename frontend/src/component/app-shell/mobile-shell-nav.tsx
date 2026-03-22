"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { AppSidebar } from "@/component/app-shell/app-sidebar";

type NavigationItem = {
  key: string;
  label: string;
  href?: string;
  statusLabel?: string;
};

type MobileShellNavProps = {
  productName: string;
  workspaceLabel: string;
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
      <div className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-0 rounded-[0.96rem] border border-[var(--color-border)] bg-[rgba(255,255,255,0.88)] px-3 py-2.5 shadow-[var(--shadow-sm)] backdrop-blur-[18px] lg:hidden max-[22rem]:grid-cols-[auto_minmax(0,1fr)_auto] max-[22rem]:gap-y-2 max-[22rem]:px-2.5">
        <button
          type="button"
          aria-expanded={isOpen}
          aria-label={openLabel}
          aria-controls="mobile-shell-navigation"
          onClick={() => setIsOpen(true)}
          className="ui-menu-trigger col-start-1 row-start-1 inline-flex h-10 w-10 shrink-0 items-center justify-center"
        >
          <MenuIcon />
        </button>

        <div className="col-start-2 row-start-1 min-w-0 text-[var(--color-text)] max-[22rem]:col-start-2 max-[22rem]:row-start-2 max-[22rem]:col-span-2">
          <p className="truncate text-[0.95rem] font-semibold text-[var(--color-text)] max-[22rem]:text-[0.88rem] max-[22rem]:font-medium max-[22rem]:text-[var(--color-text-muted)]">
            {workspaceLabel}
          </p>
        </div>

        <div className="col-start-3 row-start-1 min-w-0 truncate text-sm font-semibold tracking-[-0.02em] text-[var(--color-text)] max-[22rem]:col-start-2 max-[22rem]:row-start-1 max-[22rem]:text-[0.9rem]">
          {productName}
        </div>

        <div className="col-start-4 row-start-1 inline-flex h-10 w-10 shrink-0 items-center justify-center justify-self-end rounded-[0.72rem] border border-[rgba(37,117,216,0.12)] bg-[linear-gradient(180deg,#4f8eea_0%,#2b63bb_100%)] text-lg font-bold tracking-[-0.04em] text-white shadow-[var(--shadow-xs)] max-[22rem]:col-start-3 max-[22rem]:row-start-1">
          V
        </div>
      </div>

      {isOpen && portalTarget
        ? createPortal(
            <div className="fixed inset-0 z-[120] lg:hidden">
              <button
                type="button"
                aria-label={closeLabel}
                onClick={() => setIsOpen(false)}
                className="absolute inset-0 bg-[rgba(19,32,51,0.38)] backdrop-blur-[3px]"
              />

              <div
                id="mobile-shell-navigation"
                className="relative h-full w-[min(19.5rem,calc(100vw-1rem))] shadow-[var(--shadow-lg)]"
              >
                <AppSidebar
                  productName={productName}
                  workspaceLabel={workspaceLabel}
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
