"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings, LayoutDashboard, Users, Activity, LogOut, Building2, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageToggle } from "@/components/language-toggle";
import { useAuthSession } from "@/lib/auth/client";

const SUPPORTED_LOCALES = ["de", "en"] as const;

// Navigation label translations
const NAV_LABELS = {
  de: {
    overview: "Übersicht",
    vendors: "Anbieter",
    reporting: "Berichte",
    settings: "Einstellungen",
    users: "Benutzerverwaltung",
    auditLogs: "Audit-Trail",
    companies: "Unternehmen",
    nis2Label: "NIS2-konforme Bewertungen",
    signOut: "Abmelden",
  },
  en: {
    overview: "Overview",
    vendors: "Vendors",
    reporting: "Reports",
    settings: "Settings",
    users: "User Management",
    auditLogs: "Audit Trail",
    companies: "Companies",
    nis2Label: "NIS2-aligned assessments",
    signOut: "Sign out",
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

function getNav(locale: "de" | "en", role: string | null) {
  const base = [
    { href: "/dashboard", label: NAV_LABELS[locale].overview, icon: LayoutDashboard },
    { href: "/vendors", label: NAV_LABELS[locale].vendors, icon: Users },
    { href: "/reporting", label: NAV_LABELS[locale].reporting, icon: BarChart3 },
    { href: "/admin/audit-logs", label: NAV_LABELS[locale].auditLogs, icon: Activity },
  ];

  if (role === "ADMIN" || role === "AUDITOR") {
    base.splice(2, 0, {
      href: "/settings",
      label: NAV_LABELS[locale].settings,
      icon: Settings,
    });
  }

  if (role === "ADMIN") {
    base.splice(3, 0, {
      href: "/dashboard/users",
      label: NAV_LABELS[locale].users,
      icon: Users,
    });
  }

  if (role === "SUPER_ADMIN") {
    base.splice(3, 0, {
      href: "/admin/companies",
      label: NAV_LABELS[locale].companies,
      icon: Building2,
    });
  }

  return base;
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const session = useAuthSession();
  const locale = getLocaleFromPathname(pathname);
  const normalizedPathname = stripLocale(pathname);
  const nav = getNav(locale, session?.role ?? null);

  const handleSignOut = async () => {
    try {
      const res = await fetch("/api/auth/sign-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale }),
      });
      const data = (await res.json()) as { ok: boolean; redirectTo?: string };
      window.location.href = data.redirectTo ?? `/${locale}/auth/sign-in`;
    } catch {
      window.location.href = `/${locale}/auth/sign-in`;
    }
  };

  const isExternal = normalizedPathname.startsWith("/external/");
  const isAuth = normalizedPathname.startsWith("/auth/");

  if (isExternal || isAuth) {
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
            <Image src="/logo.png" alt="Venshield logo" width={32} height={32} className="rounded-md" priority />
            <div className="leading-tight">
              <p className="text-sm font-semibold tracking-tight">Venshield</p>
              <p className="text-[10px] text-muted-foreground">
                {session?.role === "ADMIN" ? "Admin workspace" : session?.role === "AUDITOR" ? "Auditor workspace" : "Vendor risk"}
              </p>
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
            <button
              type="button"
              onClick={handleSignOut}
              className="mt-2 flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800/80"
            >
              <LogOut className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
              {NAV_LABELS[locale].signOut}
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur-sm dark:border-slate-800 dark:bg-card/95 md:px-6">
            <div className="flex min-w-0 items-center gap-3 md:hidden">
              <Image src="/logo.png" alt="Venshield logo" width={32} height={32} className="rounded-md" priority />
              <span className="truncate text-sm font-semibold">Venshield</span>
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
              <button
                type="button"
                onClick={handleSignOut}
                title={NAV_LABELS[locale].signOut}
                className="flex h-8 w-8 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800/80"
                aria-label={NAV_LABELS[locale].signOut}
              >
                <LogOut className="h-4 w-4" aria-hidden />
              </button>
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
