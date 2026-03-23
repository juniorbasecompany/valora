import { useTranslations } from "next-intl";

export default function AppLoadingPage() {
  const t = useTranslations("State");

  return (
    <section className="ui-page-stack">
      <div className="ui-panel ui-loading-panel">
        <div className="ui-skeleton ui-skeleton-pill ui-skeleton-title ui-pulse" />
        <div className="ui-skeleton ui-skeleton-line ui-skeleton-line-wide ui-space-top-xl ui-pulse" />
        <div className="ui-skeleton ui-skeleton-line ui-skeleton-line-medium ui-space-top-sm ui-pulse" />
      </div>

      <div className="ui-grid-cards-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="ui-card ui-loading-card">
            <div className="ui-skeleton ui-skeleton-tile ui-skeleton-icon ui-pulse" />
            <div className="ui-skeleton ui-skeleton-line ui-skeleton-label-wide ui-space-top-lg ui-pulse" />
            <div className="ui-skeleton ui-skeleton-line ui-space-top-lg ui-pulse" />
            <div className="ui-skeleton ui-skeleton-line ui-skeleton-line-short ui-space-top-sm ui-pulse" />
          </div>
        ))}
      </div>

      <p className="ui-text-note">
        {t("loadingDescription")}
      </p>
    </section>
  );
}
