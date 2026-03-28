import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { Providers } from "./providers";

/**
 * Root metadata: self-hosted fonts (no Google Fonts CDN), conservative referrer,
 * privacy-oriented description. Pair with EU-region hosting and subprocessors in production.
 */
export const metadata: Metadata = {
  title: {
    default: "AVRA — Automated Vendor Risk Assessment",
    template: "%s | AVRA",
  },
  description:
    "NIS2-aligned third-party risk assessments for IT security officers. Designed for EU enterprise security: self-hosted assets, data minimization in telemetry, and EU-based AI routing when enabled.",
  applicationName: "AVRA",
  referrer: "strict-origin-when-cross-origin",
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} min-h-screen bg-background font-sans antialiased`}
      >
        <a
          href="#main-content"
          className="sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:m-0 focus:inline-flex focus:h-auto focus:w-auto focus:overflow-visible focus:rounded-md focus:border focus:border-border focus:bg-card focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-card-foreground focus:shadow-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
        >
          Skip to main content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
