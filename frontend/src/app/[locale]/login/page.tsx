import Script from "next/script";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { GoogleSignInPanel } from "@/component/auth/google-sign-in-panel";
import { LoginLocaleBar } from "@/component/i18n/login-locale-bar";
import { Badge } from "@/component/ui/badge";
import {
  AuditIcon,
  SparkIcon,
  ValoraMark,
  WorkflowIcon
} from "@/component/ui/ui-icons";
import { getAuthSession } from "@/lib/auth/server-session";

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
  const authSession = await getAuthSession();
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  if (authSession) {
    redirect(`/${locale}/app`);
  }

  const noticeMessage =
    reason === "signed_out"
      ? t("notice.signedOut")
      : reason === "auth_required"
        ? t("notice.authRequired")
        : null;

  return (
    <main className="ui-shell relative min-h-screen">
      <LoginLocaleBar currentLocale={locale} />
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />
      <section className="mx-auto grid min-h-screen max-w-7xl gap-8 px-6 py-12 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:px-8">
        <div className="ui-panel flex flex-col gap-7 px-6 py-7 lg:px-8 lg:py-8">
          <div className="flex items-center gap-4">
            <div className="rounded-[1.35rem] border border-[rgba(37,117,216,0.12)] bg-white/85 p-1.5 shadow-[var(--shadow-xs)]">
              <ValoraMark />
            </div>
            <Badge>
              {t("eyebrow")}
            </Badge>
          </div>

          <div className="space-y-4">
            <h1 className="ui-header-title max-w-3xl text-4xl font-semibold tracking-[-0.05em] text-[var(--color-text)] lg:text-[3.3rem]">
              {t("title")}
            </h1>
            <p className="max-w-2xl text-base leading-8 text-[var(--color-text-muted)]">
              {t("description")}
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <article className="ui-card p-5">
              <div className="ui-icon-badge">
                <SparkIcon className="h-[1.05rem] w-[1.05rem]" />
              </div>
              <h2 className="mt-4 text-sm font-semibold text-[var(--color-text)]">
                {t("cards.workspace.title")}
              </h2>
              <p className="mt-2 text-sm leading-6 text-[var(--color-text-subtle)]">
                {t("cards.workspace.description")}
              </p>
            </article>

            <article className="ui-card p-5">
              <div className="ui-icon-badge ui-icon-badge-attention">
                <AuditIcon className="h-[1.05rem] w-[1.05rem]" />
              </div>
              <h2 className="mt-4 text-sm font-semibold text-[var(--color-text)]">
                {t("cards.traceability.title")}
              </h2>
              <p className="mt-2 text-sm leading-6 text-[var(--color-text-subtle)]">
                {t("cards.traceability.description")}
              </p>
            </article>

            <article className="ui-card p-5">
              <div className="ui-icon-badge">
                <WorkflowIcon className="h-[1.05rem] w-[1.05rem]" />
              </div>
              <h2 className="mt-4 text-sm font-semibold text-[var(--color-text)]">
                {t("cards.nextStep.title")}
              </h2>
              <p className="mt-2 text-sm leading-6 text-[var(--color-text-subtle)]">
                {t("cards.nextStep.description")}
              </p>
            </article>
          </div>
        </div>

        <section className="ui-panel p-6 lg:p-7">
          <div className="flex flex-col gap-2">
            <h2 className="ui-header-title text-2xl font-semibold tracking-[-0.03em] text-[var(--color-text)]">
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
              rememberMeLabel={t("form.rememberMeLabel")}
            />
          </div>

          <div className="ui-card mt-6 px-4 py-4 text-sm leading-6 text-[var(--color-text-subtle)]">
            <p>{t("form.accessPolicy")}</p>
          </div>
        </section>
      </section>
    </main>
  );
}
