type StatusPanelProps = {
  title: string;
  description: string;
  tone?: "neutral" | "positive" | "attention";
};

const toneClassNameByTone = {
  neutral: "ui-tone-neutral",
  positive: "ui-tone-positive",
  attention: "ui-tone-attention"
} as const;

export function StatusPanel({
  title,
  description,
  tone = "neutral"
}: StatusPanelProps) {
  return (
    <div
      className={`rounded-[var(--radius-card)] border px-4 py-3 text-sm shadow-[var(--shadow-xs)] ${toneClassNameByTone[tone]}`}
    >
      <div className="font-medium">{title}</div>
      <div className="mt-1 opacity-80">{description}</div>
    </div>
  );
}
