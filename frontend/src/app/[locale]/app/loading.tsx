import { useTranslations } from "next-intl";

export default function AppLoadingPage() {
  const t = useTranslations("State");

  return (
    <section className="flex flex-col gap-6">
      <div className="ui-panel p-6">
        <div className="ui-skeleton h-6 w-48 animate-pulse rounded" />
        <div className="ui-skeleton mt-4 h-4 w-full max-w-2xl animate-pulse rounded" />
        <div className="ui-skeleton mt-2 h-4 w-full max-w-xl animate-pulse rounded" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="ui-card p-5">
            <div className="ui-skeleton h-4 w-32 animate-pulse rounded" />
            <div className="ui-skeleton mt-4 h-4 w-full animate-pulse rounded" />
            <div className="ui-skeleton mt-2 h-4 w-5/6 animate-pulse rounded" />
          </div>
        ))}
      </div>

      <p className="text-sm text-[var(--color-text-subtle)]">
        {t("loadingDescription")}
      </p>
    </section>
  );
}
