import type { ReactNode } from "react";

import { InfoIcon } from "@/component/ui/ui-icons";

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description: string;
  actionSlot?: ReactNode;
};

export function PageHeader({
  eyebrow,
  title,
  description,
  actionSlot
}: PageHeaderProps) {
  return (
    <header className="ui-panel ui-page-header">
      <div className="ui-page-header-glow" />

      <div className="ui-page-header-main">
        {eyebrow ? (
          <span className="ui-context-label">
            <InfoIcon className="ui-icon-xs" />
            <span>{eyebrow}</span>
          </span>
        ) : null}

        <div className="ui-page-header-copy">
          <h1 className="ui-header-title ui-title-page">
            {title}
          </h1>
          <p className="ui-page-description">
            {description}
          </p>
        </div>
      </div>

      {actionSlot ? <div className="ui-page-header-side">{actionSlot}</div> : null}
    </header>
  );
}
