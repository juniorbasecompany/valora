"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  authSessionCookieName,
  authSessionCookieValue
} from "@/lib/auth/session";

export async function signInAction(formData: FormData) {
  const locale = formData.get("locale");
  const nextLocale = typeof locale === "string" ? locale : "pt-BR";

  const cookieStore = await cookies();
  cookieStore.set(authSessionCookieName, authSessionCookieValue, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/"
  });

  redirect(`/${nextLocale}/app`);
}

export async function signOutAction(formData: FormData) {
  const locale = formData.get("locale");
  const nextLocale = typeof locale === "string" ? locale : "pt-BR";

  const cookieStore = await cookies();
  cookieStore.delete(authSessionCookieName);

  redirect(`/${nextLocale}/login?reason=signed_out`);
}
