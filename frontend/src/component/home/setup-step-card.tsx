import Link from "next/link";
import type { ReactNode } from "react";

import { ArrowUpRightIcon } from "@/component/ui/ui-icons";

type SetupStepCardProps = {
  title: string;
  description: string;
  statusLabel: string;
  tone?: "neutral" | "attention" | "positive";
  actionHref?: string;
  actionLabel?: string;
  iconSlot?: ReactNode;
};

const toneClassNameByTone = {
  neutral: "ui-tone-neutral",
  attention: "ui-tone-attention",
  positive: "ui-tone-positive"
} as const;

export function SetupStepCard({
  title,
  description,
  statusLabel,
  tone = "neutral",
  actionHref,
  actionLabel,
  iconSlot
}: SetupStepCardProps) {
  const isPlanned = !actionHref;

  return (
    <article className={`ui-card ui-card-stack ${isPlanned ? "ui-card-coming-soon" : ""}`}>
      <div className="ui-card-main">
        {iconSlot ? (
          <div
            className={`ui-icon-badge ui-shrink-0 ${
              tone === "attention"
                ? "ui-icon-badge-attention"
                : tone === "positive"
                  ? "ui-icon-badge-positive"
                  : isPlanned
                    ? "ui-icon-badge-construction"
                    : ""
            }`}
          >
            {iconSlot}
          </div>
        ) : null}
        <div className="ui-card-copy">
          <div className="ui-row-wrap">
            <h3 className="ui-header-title ui-title-section">
              {title}
            </h3>
            <span
              className={`ui-badge ${
                isPlanned && tone === "neutral"
                  ? "ui-badge-construction"
                  : toneClassNameByTone[tone]
              }`}
            >
              {statusLabel}
            </span>
          </div>
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
      ) : (
        <div className="ui-dashed-divider ui-card-divider-fill" />
      )}
    </article>
  );
}
