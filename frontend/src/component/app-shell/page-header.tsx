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
    <header className="ui-panel relative flex flex-col gap-5 px-6 py-6 lg:flex-row lg:items-start lg:justify-between lg:px-7 lg:py-7">
      <div className="pointer-events-none absolute right-0 top-0 h-36 w-36 rounded-full bg-[radial-gradient(circle,_rgba(37,117,216,0.22),_transparent_68%)] blur-2xl" />

      <div className="relative flex max-w-3xl flex-col gap-4">
        {eyebrow ? (
          <span className="ui-context-label max-w-full">
            <InfoIcon className="h-3 w-3" />
            <span>{eyebrow}</span>
          </span>
        ) : null}

        <div className="space-y-3">
          <h1 className="ui-header-title text-3xl font-semibold tracking-[-0.04em] text-[var(--color-text)] lg:text-[2.4rem]">
            {title}
          </h1>
          <p className="max-w-2xl text-sm leading-7 text-[var(--color-text-muted)] lg:text-[0.97rem]">
            {description}
          </p>
        </div>
      </div>

      {actionSlot ? <div className="relative shrink-0 lg:max-w-sm">{actionSlot}</div> : null}
    </header>
  );
}