"use client";

import { useTranslations } from "next-intl";

type AppErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function AppErrorPage({ error, reset }: AppErrorPageProps) {
  const t = useTranslations("State");

  return (
    <section className="ui-notice-danger ui-notice-panel">
      <div className="ui-panel-stack-compact">
        <h2 className="ui-header-title ui-title-section-xl">
          {t("errorTitle")}
        </h2>
        <p className="ui-text-note-muted ui-copy-limit">
          {t("errorDescription")}
        </p>
        {error.message ? (
          <p className="ui-card ui-tone-danger ui-notice-block ui-text-note-muted">
            {error.message}
          </p>
        ) : null}
        <div>
          <button
            type="button"
            onClick={reset}
            className="ui-button-danger"
          >
            {t("retry")}
          </button>
        </div>
      </div>
    </section>
  );
}
