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
    <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <div className="space-y-3">
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-slate-100">{title}</h3>
          <p className="text-sm leading-6 text-slate-400">{description}</p>
        </div>
        <div>
          <Link
            href={href}
            className="inline-flex rounded-xl border border-slate-700 px-3 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-600 hover:bg-slate-800"
          >
            {actionLabel}
          </Link>
        </div>
      </div>
    </article>
  );
}
