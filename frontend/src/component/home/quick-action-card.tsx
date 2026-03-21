import Link from "next/link";

type QuickActionCardProps = {
  title: string;
  description: string;
  href: string;
  actionLabel: string;
};

export function QuickActionCard({
  title,
  description,
  href,
  actionLabel
}: QuickActionCardProps) {
  return (
    <article className="ui-card p-5">
      <div className="space-y-3">
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-[var(--color-text)]">{title}</h3>
          <p className="text-sm leading-6 text-[var(--color-text-subtle)]">
            {description}
          </p>
        </div>
        <div>
          <Link
            href={href}
            className="ui-button-secondary inline-flex items-center text-sm font-medium transition"
          >
            {actionLabel}
          </Link>
        </div>
      </div>
    </article>
  );
}
