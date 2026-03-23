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
    <div className="ui-login-locale-bar">
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
