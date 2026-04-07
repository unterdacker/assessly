import type { Metadata } from "next";
import { cookies } from "next/headers";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { Providers } from "./providers";
import { DashboardShell } from "@/components/dashboard-shell";
import { getOptionalAuthSession } from "@/lib/auth/server";
// Triggers Zod validation of all environment variables at server startup.
// In production the process will throw here (before serving any request) if
// any required variable is absent, too short, or set to a placeholder value.
import "@/lib/env";

/**
 * Root metadata: self-hosted fonts (no Google Fonts CDN), conservative referrer,
 * privacy-oriented description. Pair with EU-region hosting and subprocessors in production.
 */
export const metadata: Metadata = {
  title: {
    default: "Assessly — Sovereign Vendor Risk Assessment",
    template: "%s | Assessly",
  },
  description:
    "NIS2-aligned third-party risk assessments for IT security officers. Designed for EU enterprise security: self-hosted assets, data minimization in telemetry, and EU-based AI routing when enabled.",
  applicationName: "Assessly",
  referrer: "strict-origin-when-cross-origin",
  robots: { index: true, follow: true },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const session = await getOptionalAuthSession();
  const localeCookie = cookieStore.get("NEXT_LOCALE")?.value;
  const htmlLang = localeCookie === "de" || localeCookie === "en" ? localeCookie : "de";

  return (
    <html lang={htmlLang} suppressHydrationWarning>
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} min-h-screen bg-background font-sans antialiased`}
      >
        <a
          href="#main-content"
          className="sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:m-0 focus:inline-flex focus:h-auto focus:w-auto focus:overflow-visible focus:rounded-md focus:border focus:border-border focus:bg-card focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-card-foreground focus:shadow-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
        >
          Skip to main content
        </a>
        <Providers
          session={session ? {
            userId: session.userId,
            role: session.role,
            companyId: session.companyId,
            vendorId: session.vendorId,
            email: session.email,
            displayName: session.displayName,
          } : null}
        >
          <DashboardShell>
            {children}
          </DashboardShell>
        </Providers>
      </body>
    </html>
  );
}
