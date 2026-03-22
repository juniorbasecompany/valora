import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { TenantSelectionPanel } from "@/component/auth/tenant-selection-panel";
import { getAuthSession } from "@/lib/auth/server-session";

type SelectTenantPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function SelectTenantPage({
  params
}: SelectTenantPageProps) {
  const { locale } = await params;
  const t = await getTranslations("SelectTenantPage");
  const authSession = await getAuthSession();

  if (authSession) {
    redirect(`/${locale}/app`);
  }

  return (
    <main className="ui-shell min-h-screen">
      <section className="mx-auto flex min-h-screen max-w-5xl px-6 py-12">
        <div className="my-auto w-full">
          <TenantSelectionPanel
            locale={locale}
            copy={{
              loading: t("loading"),
              title: t("title"),
              description: t("description"),
              activeListTitle: t("activeListTitle"),
              inviteListTitle: t("inviteListTitle"),
              createTitle: t("createTitle"),
              createDescription: t("createDescription"),
              createAction: t("createAction"),
              createPending: t("createPending"),
              acceptAction: t("acceptAction"),
              rejectAction: t("rejectAction"),
              selectAction: t("selectAction"),
              processing: t("processing"),
              empty: t("empty"),
              backToLogin: t("backToLogin"),
              genericError: t("genericError")
            }}
          />
        </div>
      </section>
    </main>
  );
}
