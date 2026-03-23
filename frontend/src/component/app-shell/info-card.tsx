import Link from "next/link";
import type { ReactNode } from "react";

import { ArrowUpRightIcon } from "@/component/ui/ui-icons";

type InfoCardProps = {
  title: string;
  description: string;
  iconSlot?: ReactNode;
  actionHref?: string;
  actionLabel?: string;
};

export function InfoCard({
  title,
  description,
  iconSlot,
  actionHref,
  actionLabel
}: InfoCardProps) {
  return (
    <article className="ui-card ui-card-stack">
      <div className="ui-card-main">
        {iconSlot ? <div className="ui-icon-badge ui-shrink-0">{iconSlot}</div> : null}
        <div className="ui-section-copy">
          <h2 className="ui-header-title ui-title-section">
            {title}
          </h2>
          <p className="ui-copy-body">
            {description}
          </p>
        </div>
      </div>
      {actionHref && actionLabel ? (
        <div className="ui-card-action">
          <Link className="ui-link" href={actionHref}>
            {actionLabel}
            <ArrowUpRightIcon />
          </Link>
        </div>
      ) : null}
    </article>
  );
}
