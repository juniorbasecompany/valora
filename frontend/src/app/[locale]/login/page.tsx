import Script from "next/script";
import { getTranslations } from "next-intl/server";

import { GoogleSignInPanel } from "@/component/auth/google-sign-in-panel";

type LoginPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ reason?: string }>;
};

export default async function LoginPage({
  params,
  searchParams
}: LoginPageProps) {
  const { locale } = await params;
  const { reason } = await searchParams;
  const t = await getTranslations("LoginPage");
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  const noticeMessage =
    reason === "signed_out"
      ? t("notice.signedOut")
      : reason === "auth_required"
        ? t("notice.authRequired")
        : null;

  return (
    <main className="ui-shell min-h-screen">
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />
      <section className="mx-auto grid min-h-screen max-w-6xl gap-8 px-6 py-12 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
        <div className="flex flex-col gap-6">
          <span className="ui-pill inline-flex w-fit px-3 py-1 text-xs font-medium">
            {t("eyebrow")}
          </span>

          <div className="space-y-4">
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-[var(--color-text)] lg:text-5xl">
              {t("title")}
            </h1>
            <p className="max-w-2xl text-base leading-8 text-[var(--color-text-muted)]">
              {t("description")}
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <article className="ui-card p-5">
              <h2 className="text-sm font-medium text-[var(--color-text)]">
                {t("cards.workspace.title")}
              </h2>
              <p className="mt-2 text-sm leading-6 text-[var(--color-text-subtle)]">
                {t("cards.workspace.description")}
              </p>
            </article>

            <article className="ui-card p-5">
              <h2 className="text-sm font-medium text-[var(--color-text)]">
                {t("cards.traceability.title")}
              </h2>
              <p className="mt-2 text-sm leading-6 text-[var(--color-text-subtle)]">
                {t("cards.traceability.description")}
              </p>
            </article>

            <article className="ui-card p-5">
              <h2 className="text-sm font-medium text-[var(--color-text)]">
                {t("cards.nextStep.title")}
              </h2>
              <p className="mt-2 text-sm leading-6 text-[var(--color-text-subtle)]">
                {t("cards.nextStep.description")}
              </p>
            </article>
          </div>
        </div>

        <section className="ui-panel p-6">
          <div className="flex flex-col gap-2">
            <h2 className="text-2xl font-semibold tracking-tight text-[var(--color-text)]">
              {t("form.title")}
            </h2>
            <p className="text-sm leading-6 text-[var(--color-text-subtle)]">
              {t("form.description")}
            </p>
          </div>

          {noticeMessage ? (
            <div className="ui-notice-attention mt-5 px-4 py-3 text-sm">
              {noticeMessage}
            </div>
          ) : null}

          <div className="mt-6">
            <GoogleSignInPanel
              locale={locale}
              clientId={googleClientId}
              buttonLabel={t("form.submitIdle")}
              buttonPendingLabel={t("form.submitPending")}
              helperText={t("form.helper")}
              unavailableText={t("form.googleUnavailable")}
              genericErrorText={t("form.error")}
            />
          </div>

          <div className="ui-card mt-6 px-4 py-4 text-sm text-[var(--color-text-subtle)]">
            <p>{t("form.accessPolicy")}</p>
          </div>
        </section>
      </section>
    </main>
  );
}
