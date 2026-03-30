"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings, LayoutDashboard, ShieldCheck, Users, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageToggle } from "@/components/language-toggle";

const SUPPORTED_LOCALES = ["de", "en"] as const;

// Navigation label translations
const NAV_LABELS = {
  de: {
    overview: "Übersicht",
    vendors: "Anbieter",
    settings: "Einstellungen",
    auditLogs: "Audit-Trail",
    nis2Label: "NIS2-konforme Bewertungen",
  },
  en: {
    overview: "Overview",
    vendors: "Vendors",
    settings: "Settings",
    auditLogs: "Audit Trail",
    nis2Label: "NIS2-aligned assessments",
  },
};

function getLocaleFromPathname(pathname: string): "de" | "en" {
  const segment = pathname.split("/")[1];
  return SUPPORTED_LOCALES.includes(segment as "de" | "en")
    ? (segment as "de" | "en")
    : "de";
}

function stripLocale(pathname: string): string {
  const segment = pathname.split("/")[1];
  if (!SUPPORTED_LOCALES.includes(segment as "de" | "en")) {
    return pathname || "/";
  }

  const stripped = pathname.slice(segment.length + 1);
  return stripped || "/";
}

const getNav = (locale: "de" | "en") => [
  { href: "/dashboard", label: NAV_LABELS[locale].overview, icon: LayoutDashboard },
  { href: "/vendors", label: NAV_LABELS[locale].vendors, icon: Users },
  { href: "/settings", label: NAV_LABELS[locale].settings, icon: Settings },
  { href: "/admin/audit-logs", label: NAV_LABELS[locale].auditLogs, icon: Activity },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const locale = getLocaleFromPathname(pathname);
  const normalizedPathname = stripLocale(pathname);
  const nav = getNav(locale);

  const isExternal = normalizedPathname.startsWith("/external/");

  if (isExternal) {
    return (
      <div className="min-h-screen bg-slate-50/80 dark:bg-background">
        <main
          id="main-content"
          className="flex-1"
          tabIndex={-1}
        >
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/80 dark:bg-background">
      <div className="flex min-h-screen">
        <aside
          className="hidden w-56 shrink-0 border-r border-slate-200 bg-white/90 dark:border-slate-800 dark:bg-card md:flex md:flex-col"
          aria-label="Workspace navigation"
        >
          <div className="flex h-14 items-center gap-2 border-b border-slate-200 px-4 dark:border-slate-800">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-indigo-600 text-white dark:bg-indigo-500">
              <ShieldCheck className="h-4 w-4" aria-hidden />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold tracking-tight">AVRA</p>
              <p className="text-[10px] text-muted-foreground">Vendor risk</p>
            </div>
          </div>
          <nav
            className="flex flex-1 flex-col gap-0.5 p-3"
            aria-label="Main"
          >
            {nav.map(({ href, label, icon: Icon }) => {
              const localizedHref = `/${locale}${href}`;
              const active =
                normalizedPathname === href || normalizedPathname.startsWith(`${href}/`);
              return (
                <Link
                  key={localizedHref}
                  href={localizedHref}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-indigo-50 text-indigo-900 dark:bg-indigo-950/50 dark:text-indigo-100"
                      : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800/80",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                  {label}
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-slate-200 p-3 dark:border-slate-800">
            <p className="px-3 text-[10px] uppercase tracking-wider text-muted-foreground">
              {NAV_LABELS[locale].nis2Label}
            </p>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur-sm dark:border-slate-800 dark:bg-card/95 md:px-6">
            <div className="flex min-w-0 items-center gap-3 md:hidden">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-indigo-600 text-white">
                <ShieldCheck className="h-4 w-4" aria-hidden />
              </div>
              <span className="truncate text-sm font-semibold">AVRA</span>
            </div>
            <div className="hidden md:block" />
            <div className="flex items-center gap-2">
              <nav className="flex gap-1 md:hidden" aria-label="Main">
                {nav.map(({ href, label }) => {
                  const localizedHref = `/${locale}${href}`;
                  const active =
                    normalizedPathname === href || normalizedPathname.startsWith(`${href}/`);
                  return (
                    <Link
                      key={localizedHref}
                      href={localizedHref}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "rounded-md px-2 py-1 text-xs font-medium",
                        active
                          ? "bg-indigo-100 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200"
                          : "text-muted-foreground",
                      )}
                    >
                      {label}
                    </Link>
                  );
                })}
              </nav>
              <LanguageToggle />
              <ThemeToggle />
            </div>
          </header>
          <main
            id="main-content"
            className="flex-1 p-4 md:p-6"
            tabIndex={-1}
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
