type SetupStepCardProps = {
  title: string;
  description: string;
  statusLabel: string;
  tone?: "neutral" | "attention" | "positive";
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
  tone = "neutral"
}: SetupStepCardProps) {
  return (
    <article className="ui-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-[var(--color-text)]">{title}</h3>
          <p className="text-sm leading-6 text-[var(--color-text-subtle)]">
            {description}
          </p>
        </div>
        <span
          className={`ui-pill px-2.5 py-1 text-xs font-medium ${toneClassNameByTone[tone]}`}
        >
          {statusLabel}
        </span>
      </div>
    </article>
  );
}
