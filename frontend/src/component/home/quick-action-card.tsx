import Link from "next/link";
import type { ReactNode } from "react";

import { ArrowUpRightIcon } from "@/component/ui/ui-icons";

type QuickActionCardProps = {
  title: string;
  description: string;
  href: string;
  actionLabel: string;
  iconSlot?: ReactNode;
};

export function QuickActionCard({
  title,
  description,
  href,
  actionLabel,
  iconSlot
}: QuickActionCardProps) {
  return (
    <article className="ui-card ui-preview-card-accent ui-card-stack">
      <div className="ui-preview-card-glow" />
      <div className="ui-card-main">
        {iconSlot ? <div className="ui-icon-badge ui-shrink-0">{iconSlot}</div> : null}
        <div className="ui-section-copy">
          <h3 className="ui-header-title ui-title-section">
            {title}
          </h3>
          <p className="ui-copy-body">
            {description}
          </p>
        </div>
      </div>
      <div className="ui-card-action">
        <Link
          href={href}
          className="ui-button-secondary"
        >
          {actionLabel}
          <ArrowUpRightIcon />
        </Link>
      </div>
    </article>
  );
}
