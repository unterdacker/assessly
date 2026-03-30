"use client";

import { usePathname, useSearchParams } from "next/navigation";

const SUPPORTED_LOCALES = ["de", "en"] as const;

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

export function LanguageToggle() {
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();

  const locale = getLocaleFromPathname(pathname);
  const normalizedPathname = stripLocale(pathname);
  const search = searchParams.toString();

  const getHref = (targetLocale: "de" | "en") => {
    const targetPath = `/${targetLocale}${normalizedPathname === "/" ? "" : normalizedPathname}`;
    return search ? `${targetPath}?${search}` : targetPath;
  };

  const handleLanguageSwitch = (targetLocale: "de" | "en") => {
    window.location.href = getHref(targetLocale);
  };

  return (
    <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-900">
      <button
        onClick={() => handleLanguageSwitch("en")}
        aria-label="Switch to English"
        className={`px-3 py-1.5 text-xs font-semibold transition-colors rounded ${
          locale === "en"
            ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-slate-100"
            : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
        }`}
      >
        EN
      </button>
      <button
        onClick={() => handleLanguageSwitch("de")}
        aria-label="Switch to German"
        className={`px-3 py-1.5 text-xs font-semibold transition-colors rounded ${
          locale === "de"
            ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-slate-100"
            : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
        }`}
      >
        DE
      </button>
    </div>
  );
}
