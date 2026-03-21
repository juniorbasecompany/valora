type StatusPanelProps = {
  title: string;
  description: string;
  tone?: "neutral" | "positive" | "attention";
};

const toneClassNameByTone = {
  neutral: "border-slate-800 bg-slate-900/70 text-slate-100",
  positive: "border-emerald-900/60 bg-emerald-950/50 text-emerald-200",
  attention: "border-amber-900/60 bg-amber-950/40 text-amber-100"
} as const;

export function StatusPanel({
  title,
  description,
  tone = "neutral"
}: StatusPanelProps) {
  return (
    <div
      className={`rounded-2xl px-4 py-3 text-sm ${toneClassNameByTone[tone]}`}
    >
      <div className="font-medium">{title}</div>
      <div className="mt-1 opacity-80">{description}</div>
    </div>
  );
}
