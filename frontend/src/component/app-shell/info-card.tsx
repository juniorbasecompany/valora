import type { ReactNode } from "react";

type InfoCardProps = {
  title: string;
  description: string;
  iconSlot?: ReactNode;
};

export function InfoCard({ title, description, iconSlot }: InfoCardProps) {
  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-slate-100">{title}</h2>
          <p className="text-sm leading-6 text-slate-400">{description}</p>
        </div>
        {iconSlot ? <div className="shrink-0">{iconSlot}</div> : null}
      </div>
    </article>
  );
}
