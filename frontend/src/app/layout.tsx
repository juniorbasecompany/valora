import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Valora",
  description: "Frontend web app for the Valora system."
};

type RootLayoutProps = {
  children: React.ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
