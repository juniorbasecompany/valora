"use client";

import { useTranslations } from "next-intl";

type AppErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function AppErrorPage({ error, reset }: AppErrorPageProps) {
  const t = useTranslations("State");

  return (
    <section className="rounded-2xl border border-rose-950/70 bg-rose-950/40 p-6 text-rose-50">
      <div className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">{t("errorTitle")}</h2>
        <p className="max-w-2xl text-sm leading-6 text-rose-100/80">
          {t("errorDescription")}
        </p>
        {error.message ? (
          <p className="rounded-xl border border-rose-900/70 bg-slate-950/40 px-4 py-3 text-sm text-rose-100/85">
            {error.message}
          </p>
        ) : null}
        <div>
          <button
            type="button"
            onClick={reset}
            className="rounded-xl border border-rose-800 bg-rose-900/40 px-4 py-2 text-sm font-medium text-rose-50 transition hover:bg-rose-900/60"
          >
            {t("retry")}
          </button>
        </div>
      </div>
    </section>
  );
}
