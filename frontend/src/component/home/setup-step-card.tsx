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
    <article className={`ui-card flex h-full flex-col gap-4 p-5 ${isPlanned ? "ui-card-coming-soon" : ""}`}>
      <div className="relative flex items-start gap-4">
        {iconSlot ? (
          <div
            className={`ui-icon-badge shrink-0 ${
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
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="ui-header-title ui-title-section">
              {title}
            </h3>
            <span
              className={`ui-badge px-2.5 py-1 text-[11px] font-semibold ${
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
        <div className="mt-auto">
          <Link className="ui-link text-sm font-semibold" href={actionHref}>
            {actionLabel}
            <ArrowUpRightIcon />
          </Link>
        </div>
      ) : (
        <div className="ui-dashed-divider mt-auto w-full" />
      )}
    </article>
  );
}
