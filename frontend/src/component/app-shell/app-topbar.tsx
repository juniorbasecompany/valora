import type { ReactNode } from "react";

type AppTopbarProps = {
  localeLabel: string;
  localeValue: string;
  statusLabel: string;
  statusValue: string;
  actionSlot?: ReactNode;
};

export function AppTopbar({
  localeLabel,
  localeValue,
  statusLabel,
  statusValue,
  actionSlot
}: AppTopbarProps) {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-slate-800 bg-slate-950/70 px-6 py-4 backdrop-blur">
      <div>
        <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
          {statusLabel}
        </p>
        <p className="mt-1 text-sm font-medium text-slate-100">{statusValue}</p>
      </div>

      <div className="flex items-center gap-3">
        {actionSlot}
        <div className="flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900 px-3 py-1.5 text-sm text-slate-300">
          <span className="text-slate-500">{localeLabel}</span>
          <span className="font-medium text-slate-100">{localeValue}</span>
        </div>
      </div>
    </header>
  );
}
