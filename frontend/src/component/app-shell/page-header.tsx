import type { ReactNode } from "react";

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
    <header className="ui-panel flex flex-col gap-4 px-6 py-6 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex max-w-3xl flex-col gap-3">
        {eyebrow ? (
          <span className="ui-pill inline-flex w-fit px-3 py-1 text-xs font-medium">
            {eyebrow}
          </span>
        ) : null}

        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--color-text)]">
            {title}
          </h1>
          <p className="max-w-2xl text-sm leading-7 text-[var(--color-text-muted)]">
            {description}
          </p>
        </div>
      </div>

      {actionSlot ? <div className="shrink-0">{actionSlot}</div> : null}
    </header>
  );
}
