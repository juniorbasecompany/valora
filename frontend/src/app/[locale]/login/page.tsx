import Script from "next/script";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { GoogleSignInPanel } from "@/component/auth/google-sign-in-panel";
import { LoginLocaleBar } from "@/component/i18n/login-locale-bar";
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
        reason === "auth_required" ? t("notice.authRequired") : null;

    return (
        <main className="ui-shell ui-shell-page ui-auth-page">
            <LoginLocaleBar currentLocale={locale} />
            <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />
            <section className="ui-auth-layout">
                <div className="ui-panel ui-auth-hero">
                    <div className="ui-row-center">
                        <div className="ui-auth-mark">
                            <ValoraMark />
                        </div>
                        <span className="ui-auth-product-name">{t("productName")}</span>
                    </div>

                    <p className="ui-auth-tagline">{t("tagline")}</p>

                    <div className="ui-heading-stack-lg">
                        <h1 className="ui-header-title ui-title-page ui-title-page-hero">
                            {t("title")}
                        </h1>
                        <p className="ui-copy-hero">
                            {t("description")}
                        </p>
                    </div>

                    <div className="ui-auth-pillar-list" role="list">
                        <article className="ui-auth-pillar" role="listitem">
                            <div className="ui-auth-pillar-top">
                                <div className="ui-icon-badge">
                                    <SparkIcon className="ui-icon" />
                                </div>
                                <span className="ui-auth-pillar-step" aria-hidden>
                                    01
                                </span>
                            </div>
                            <div className="ui-auth-pillar-body">
                                <h2 className="ui-header-title ui-title-section">
                                    {t("cards.workspace.title")}
                                </h2>
                                <p className="ui-copy-body">
                                    {t("cards.workspace.description")}
                                </p>
                            </div>
                        </article>

                        <article
                            className="ui-auth-pillar ui-auth-pillar-accent"
                            role="listitem"
                        >
                            <div className="ui-auth-pillar-top">
                                <div className="ui-icon-badge ui-icon-badge-attention">
                                    <AuditIcon className="ui-icon" />
                                </div>
                                <span className="ui-auth-pillar-step" aria-hidden>
                                    02
                                </span>
                            </div>
                            <div className="ui-auth-pillar-body">
                                <h2 className="ui-header-title ui-title-section">
                                    {t("cards.traceability.title")}
                                </h2>
                                <p className="ui-copy-body">
                                    {t("cards.traceability.description")}
                                </p>
                            </div>
                        </article>

                        <article className="ui-auth-pillar" role="listitem">
                            <div className="ui-auth-pillar-top">
                                <div className="ui-icon-badge">
                                    <WorkflowIcon className="ui-icon" />
                                </div>
                                <span className="ui-auth-pillar-step" aria-hidden>
                                    03
                                </span>
                            </div>
                            <div className="ui-auth-pillar-body">
                                <h2 className="ui-header-title ui-title-section">
                                    {t("cards.nextStep.title")}
                                </h2>
                                <p className="ui-copy-body">
                                    {t("cards.nextStep.description")}
                                </p>
                            </div>
                        </article>
                    </div>
                </div>

                <section className="ui-panel ui-auth-panel">
                    <div className="ui-section-copy">
                        <h2 className="ui-header-title ui-title-section ui-title-section-xl">
                            {t("form.title")}
                        </h2>
                    </div>

                    {noticeMessage ? (
                        <div className="ui-notice-attention ui-notice-block">
                            {noticeMessage}
                        </div>
                    ) : null}

                    <GoogleSignInPanel
                        locale={locale}
                        clientId={googleClientId}
                        buttonLabel={t("form.submitIdle")}
                        buttonPendingLabel={t("form.submitPending")}
                        unavailableText={t("form.googleUnavailable")}
                        genericErrorText={t("form.error")}
                        rememberMeLabel={t("form.rememberMeLabel")}
                    />

                    <div className="ui-auth-policy">{t("form.accessPolicy")}</div>
                </section>
            </section>
        </main>
    );
}
