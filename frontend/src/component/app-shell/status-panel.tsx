import { CheckCircleIcon, ClockIcon, SparkIcon } from "@/component/ui/ui-icons";

type StatusPanelProps = {
  title: string;
  description: string;
  tone?: "neutral" | "positive" | "attention";
};

const toneMetaByTone = {
  neutral: {
    className: "ui-tone-neutral",
    iconClassName: "ui-icon-badge",
    Icon: SparkIcon
  },
  positive: {
    className: "ui-tone-positive",
    iconClassName: "ui-icon-badge ui-icon-badge-positive",
    Icon: CheckCircleIcon
  },
  attention: {
    className: "ui-tone-attention",
    iconClassName: "ui-icon-badge ui-icon-badge-attention",
    Icon: ClockIcon
  }
} as const;

export function StatusPanel({
  title,
  description,
  tone = "neutral"
}: StatusPanelProps) {
  const toneMeta = toneMetaByTone[tone];

  return (
    <div className={`ui-status-panel ${toneMeta.className}`}>
      <div className="ui-status-layout">
        <span className={toneMeta.iconClassName}>
          <toneMeta.Icon className="ui-icon-sm" />
        </span>
        <div className="ui-section-copy">
          <div className="ui-status-title">{title}</div>
          <div className="ui-status-description ui-status-copy">{description}</div>
        </div>
      </div>
    </div>
  );
}
