import type { ReactNode } from "react";

type AppTopbarProps = {
  tenantLabel: string;
  tenantValue: string;
  leadingSlot?: ReactNode;
  accountSlot?: ReactNode;
  actionSlot?: ReactNode;
};

export function AppTopbar({
  tenantLabel,
  tenantValue,
  leadingSlot,
  accountSlot,
  actionSlot
}: AppTopbarProps) {
  return (
    <header className="ui-topbar relative z-30 px-4 py-4 backdrop-blur sm:px-5 lg:px-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {leadingSlot ? <div className="shrink-0 pt-0.5">{leadingSlot}</div> : null}

          <div className="min-w-0">
            <span className="ui-topbar-chip inline-flex items-center gap-2 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] sm:text-[11px]">
              <span className="h-2 w-2 rounded-full bg-[var(--color-accent)] shadow-[0_0_0_4px_rgba(37,117,216,0.12)]" />
              {tenantLabel}
            </span>
            <p className="ui-header-title ui-title-section mt-2 truncate sm:mt-3 sm:text-lg">
              {tenantValue}
            </p>
          </div>
        </div>

        {actionSlot || accountSlot ? (
          <div className="flex w-full flex-wrap items-center justify-end gap-2 md:w-auto md:flex-nowrap md:gap-3">
            {actionSlot}
            {accountSlot}
          </div>
        ) : null}
      </div>
    </header>
  );
}
