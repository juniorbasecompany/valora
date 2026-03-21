import type { ReactNode } from "react";

type InfoCardProps = {
  title: string;
  description: string;
  iconSlot?: ReactNode;
};

export function InfoCard({ title, description, iconSlot }: InfoCardProps) {
  return (
    <article className="ui-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-[var(--color-text)]">{title}</h2>
          <p className="text-sm leading-6 text-[var(--color-text-subtle)]">
            {description}
          </p>
        </div>
        {iconSlot ? <div className="shrink-0">{iconSlot}</div> : null}
      </div>
    </article>
  );
}
