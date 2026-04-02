import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";

import { routing } from "@/i18n/routing";
import { authTokenCookieName, hasAuthSession } from "@/lib/auth/session";

const handleI18nRouting = createMiddleware(routing);

export default function proxy(request: NextRequest) {
  const response = handleI18nRouting(request);
  const pathname = request.nextUrl.pathname;
  const locale = routing.locales.find(
    (item) => pathname === `/${item}` || pathname.startsWith(`/${item}/`)
  );

  if (!locale) {
    return response;
  }

  const tokenValue = request.cookies.get(authTokenCookieName)?.value;
  const hasSession = hasAuthSession(tokenValue);
  const isAppArea =
    pathname === `/${locale}/app` || pathname.startsWith(`/${locale}/app/`);

  if (isAppArea && !hasSession) {
    return NextResponse.redirect(
      new URL(`/${locale}/login?reason=auth_required`, request.url)
    );
  }

  // Google Identity Services (postMessage); alinha com next.config headers.
  if (
    pathname === `/${locale}/login` ||
    pathname.startsWith(`/${locale}/login?`) ||
    pathname === `/${locale}/select-tenant` ||
    pathname.startsWith(`/${locale}/select-tenant?`)
  ) {
    response.headers.set(
      "Cross-Origin-Opener-Policy",
      "same-origin-allow-popups"
    );
  }

  return response;
}

// Exclui /health: o probe do Railway precisa de 200 direto em GET /health (sem redirect para /pt-BR/health).
// Next.js 16+: convenção `src/proxy.ts` (substitui `middleware.ts`).
export const config = {
  matcher: ["/((?!api|trpc|_next|_vercel|health|.*\\..*).*)"]
};
