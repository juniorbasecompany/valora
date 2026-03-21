import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { signInAction } from "@/app/[locale]/auth/action";
import { LoginSubmitButton } from "@/component/auth/login-submit-button";

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

  const noticeMessage =
    reason === "signed_out"
      ? t("notice.signedOut")
      : reason === "auth_required"
        ? t("notice.authRequired")
        : null;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <section className="mx-auto grid min-h-screen max-w-6xl gap-8 px-6 py-12 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
        <div className="flex flex-col gap-6">
          <span className="inline-flex w-fit rounded-full border border-slate-800 bg-slate-900 px-3 py-1 text-xs font-medium text-slate-300">
            {t("eyebrow")}
          </span>

          <div className="space-y-4">
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white lg:text-5xl">
              {t("title")}
            </h1>
            <p className="max-w-2xl text-base leading-8 text-slate-300">
              {t("description")}
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
              <h2 className="text-sm font-medium text-slate-100">
                {t("cards.workspace.title")}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {t("cards.workspace.description")}
              </p>
            </article>

            <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
              <h2 className="text-sm font-medium text-slate-100">
                {t("cards.traceability.title")}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {t("cards.traceability.description")}
              </p>
            </article>

            <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
              <h2 className="text-sm font-medium text-slate-100">
                {t("cards.nextStep.title")}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {t("cards.nextStep.description")}
              </p>
            </article>
          </div>
        </div>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/40">
          <div className="flex flex-col gap-2">
            <h2 className="text-2xl font-semibold tracking-tight text-white">
              {t("form.title")}
            </h2>
            <p className="text-sm leading-6 text-slate-400">
              {t("form.description")}
            </p>
          </div>

          {noticeMessage ? (
            <div className="mt-5 rounded-2xl border border-amber-900/60 bg-amber-950/40 px-4 py-3 text-sm text-amber-100">
              {noticeMessage}
            </div>
          ) : null}

          <form action={signInAction} className="mt-6 flex flex-col gap-4">
            <input type="hidden" name="locale" value={locale} />

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-slate-200">
                {t("form.emailLabel")}
              </span>
              <input
                type="email"
                name="email"
                autoComplete="email"
                placeholder={t("form.emailPlaceholder")}
                className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-slate-500"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-slate-200">
                {t("form.passwordLabel")}
              </span>
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                placeholder={t("form.passwordPlaceholder")}
                className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-slate-500"
              />
            </label>

            <div className="pt-2">
              <LoginSubmitButton
                idleLabel={t("form.submitIdle")}
                pendingLabel={t("form.submitPending")}
              />
            </div>
          </form>

          <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-4 text-sm text-slate-400">
            <p>{t("form.helper")}</p>
            <p className="mt-3">
              <Link
                href={`/${locale}/app`}
                className="text-slate-200 underline underline-offset-4"
              >
                {t("form.altLink")}
              </Link>
            </p>
          </div>
        </section>
      </section>
    </main>
  );
}
