import type { ReactNode } from "react";

type BadgeTone =
  | "neutral"
  | "construction"
  | "attention"
  | "positive"
  | "active";

type BadgeProps = {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
};

const toneClassNameByTone = {
  neutral: "ui-badge-neutral",
  construction: "ui-badge-construction",
  attention: "ui-badge-attention",
  positive: "ui-badge-positive",
  active: "ui-badge-active"
} as const;

function mergeClassName(...classNameList: Array<string | undefined>) {
  return classNameList.filter(Boolean).join(" ");
}

export function Badge({
  children,
  tone = "neutral",
  className
}: BadgeProps) {
  return (
    <span
      className={mergeClassName("ui-badge", toneClassNameByTone[tone], className)}
    >
      {children}
    </span>
  );
}