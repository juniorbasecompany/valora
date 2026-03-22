import type { ReactNode } from "react";

type AppTopbarProps = {
  tenantLabel: string;
  tenantValue: string;
  localeLabel: string;
  localeValue: string;
  accountLabel?: string;
  accountValue?: string;
  actionSlot?: ReactNode;
};

export function AppTopbar({
  tenantLabel,
  tenantValue,
  localeLabel,
  localeValue,
  accountLabel,
  accountValue,
  actionSlot
}: AppTopbarProps) {
  return (
    <header className="ui-topbar flex items-center justify-between gap-4 px-6 py-4 backdrop-blur">
      <div>
        <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-text-subtle)]">
          {tenantLabel}
        </p>
        <p className="mt-1 text-sm font-medium text-[var(--color-text)]">
          {tenantValue}
        </p>
      </div>

      <div className="flex items-center gap-3">
        {actionSlot}
        {accountLabel && accountValue ? (
          <div className="ui-topbar-chip flex items-center gap-2 px-4 py-2 text-sm">
            <span className="text-[var(--color-text-subtle)]">{accountLabel}</span>
            <span className="font-medium text-[var(--color-text)]">{accountValue}</span>
          </div>
        ) : null}
        <div className="ui-topbar-chip flex items-center gap-2 px-4 py-2 text-sm">
          <span className="text-[var(--color-text-subtle)]">{localeLabel}</span>
          <span className="font-medium text-[var(--color-text)]">{localeValue}</span>
        </div>
      </div>
    </header>
  );
}
