import { useTranslations } from "next-intl";

export default function AppLoadingPage() {
  const t = useTranslations("State");

  return (
    <section className="flex flex-col gap-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
        <div className="h-6 w-48 animate-pulse rounded bg-slate-800" />
        <div className="mt-4 h-4 w-full max-w-2xl animate-pulse rounded bg-slate-800" />
        <div className="mt-2 h-4 w-full max-w-xl animate-pulse rounded bg-slate-800" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5"
          >
            <div className="h-4 w-32 animate-pulse rounded bg-slate-800" />
            <div className="mt-4 h-4 w-full animate-pulse rounded bg-slate-800" />
            <div className="mt-2 h-4 w-5/6 animate-pulse rounded bg-slate-800" />
          </div>
        ))}
      </div>

      <p className="text-sm text-slate-400">{t("loadingDescription")}</p>
    </section>
  );
}
