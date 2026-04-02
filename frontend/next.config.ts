import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Permite acessar o dev server por 127.0.0.1 sem bloquear HMR/fontes (Next 16+).
  allowedDevOrigins: ["127.0.0.1"],
  // /health: liveness imediato (ver src/app/health/route.ts); readiness da API é outro fluxo.
  // Google Identity Services usa postMessage; COOP `same-origin` (ex.: hosting) bloqueia.
  // `same-origin-allow-popups` é o padrão recomendado para fluxos com popup/FedCM.
  async headers() {
    return [
      {
        source: "/:locale/login",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups"
          }
        ]
      },
      {
        source: "/:locale/select-tenant",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups"
          }
        ]
      }
    ];
  }
};

export default withNextIntl(nextConfig);
