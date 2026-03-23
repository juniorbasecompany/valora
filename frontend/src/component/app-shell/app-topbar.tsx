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
    <header className="ui-topbar ui-panel-body ui-z-30">
      <div className="ui-topbar-layout">
        <div className="ui-topbar-context">
          {leadingSlot ? <div className="ui-topbar-leading">{leadingSlot}</div> : null}

          <div className="ui-min-w-0">
            <span className="ui-topbar-chip ui-row-center-sm">
              <span className="ui-topbar-status-dot" />
              {tenantLabel}
            </span>
            <p className="ui-header-title ui-title-section ui-topbar-title">
              {tenantValue}
            </p>
          </div>
        </div>

        {actionSlot || accountSlot ? (
          <div className="ui-topbar-actions">
            {actionSlot}
            {accountSlot}
          </div>
        ) : null}
      </div>
    </header>
  );
}
