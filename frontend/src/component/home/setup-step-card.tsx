type SetupStepCardProps = {
  title: string;
  description: string;
  statusLabel: string;
  tone?: "neutral" | "attention" | "positive";
};

const toneClassNameByTone = {
  neutral: "border-slate-800 text-slate-300",
  attention: "border-amber-800/70 text-amber-200",
  positive: "border-emerald-800/70 text-emerald-200"
} as const;

export function SetupStepCard({
  title,
  description,
  statusLabel,
  tone = "neutral"
}: SetupStepCardProps) {
  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-slate-100">{title}</h3>
          <p className="text-sm leading-6 text-slate-400">{description}</p>
        </div>
        <span
          className={`rounded-full border px-2.5 py-1 text-xs font-medium ${toneClassNameByTone[tone]}`}
        >
          {statusLabel}
        </span>
      </div>
    </article>
  );
}
