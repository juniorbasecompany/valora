"use client";

import { useTranslations } from "next-intl";

import { LocaleFlagMenu } from "@/component/i18n/locale-flag-menu";
import { routing } from "@/i18n/routing";

type LoginLocaleBarProps = {
  currentLocale: string;
};

export function LoginLocaleBar({ currentLocale }: LoginLocaleBarProps) {
  const t = useTranslations("AppShell.menu");

  return (
    <div className="pointer-events-auto fixed right-6 top-6 z-50">
      <LocaleFlagMenu
        key={currentLocale}
        currentLocale={currentLocale}
        localeList={[...routing.locales]}
        copy={{
          triggerAriaLabel: t("localeFlagTriggerAriaLabel"),
          menuAriaLabel: t("localeFlagMenuAriaLabel"),
          switchingLocale: t("switchingLocale")
        }}
      />
    </div>
  );
}
