"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  usePathname,
  useRouter,
  useSearchParams
} from "next/navigation";

import { LocaleFlagSvg } from "@/component/i18n/locale-flag-svg";
import {
  getLocaleHref,
  writeStoredLocale
} from "@/lib/i18n/locale-preference";

type LocaleFlagMenuCopy = {
  triggerAriaLabel: string;
  menuAriaLabel: string;
  switchingLocale: string;
};

type LocaleFlagMenuProps = {
  currentLocale: string;
  localeList: string[];
  copy: LocaleFlagMenuCopy;
  placement?: "default" | "sidebar";
  /** Quando definido com `onOpenChange`, o menu fica controlado pelo pai (ex.: exclusão mútua com outro dropdown). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

const localeLabelMap: Record<string, string> = {
  "pt-BR": "Português (Brasil)",
  "en-US": "English (United States)",
  "es-ES": "Español (España)"
};

export function LocaleFlagMenu({
  currentLocale,
  localeList,
  copy,
  placement = "default",
  open: openProp,
  onOpenChange
}: LocaleFlagMenuProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isSidebar = placement === "sidebar";
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const isOpen = isControlled ? openProp : internalOpen;
  const [switchingLocale, setSwitchingLocale] = useState<string | null>(null);

  const setOpen = useCallback((next: boolean) => {
    if (!isControlled) {
      setInternalOpen(next);
    }
    onOpenChange?.(next);
  }, [isControlled, onOpenChange]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, setOpen]);

  function handleLocaleSelect(locale: string) {
    if (switchingLocale) {
      return;
    }

    if (locale === currentLocale) {
      setOpen(false);
      return;
    }

    writeStoredLocale(locale);
    setSwitchingLocale(locale);
    setOpen(false);
    router.push(getLocaleHref(pathname, searchParams, locale));
  }

  const optionClass = (isActive: boolean) =>
    `ui-menu-item ${
      isActive ? "ui-menu-item-active" : ""
    }`;

  const panelClassName =
    placement === "sidebar"
      ? "ui-menu-panel ui-menu-panel-sidebar ui-menu-panel-compact ui-menu-panel-overlay"
      : "ui-menu-panel ui-menu-panel-end ui-menu-panel-wide ui-menu-panel-floating";

  return (
    <div
      ref={containerRef}
      className="ui-menu-root ui-shrink-0"
    >
      <button
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={copy.triggerAriaLabel}
        data-state={isOpen ? "open" : "closed"}
        onClick={() => setOpen(!isOpen)}
        className={isSidebar ? "ui-menu-trigger-ghost" : "ui-menu-trigger"}
      >
        <LocaleFlagSvg locale={currentLocale} size="trigger" />
      </button>

      {isOpen ? (
        <div
          role="menu"
          aria-label={copy.menuAriaLabel}
          className={panelClassName}
        >
          {switchingLocale ? (
            <div className="ui-menu-feedback">
              <span className="ui-menu-feedback-label">
                {copy.switchingLocale}
              </span>
            </div>
          ) : null}

          <div className="ui-menu-list">
            {localeList.map((locale) => {
              const isActive = locale === currentLocale;
              const localeLabel = localeLabelMap[locale] || locale;

              return (
                <button
                  key={locale}
                  type="button"
                  role="menuitem"
                  onClick={() => handleLocaleSelect(locale)}
                  disabled={switchingLocale !== null}
                  className={optionClass(isActive)}
                >
                  <span className="ui-menu-label">{localeLabel}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
