import createMiddleware from "next-intl/middleware";
import { hasLocale } from "next-intl";
import { NextResponse, NextRequest } from "next/server";
import { routing } from "@/i18n/routing";

const handleI18nRouting = createMiddleware(routing);

function getLocaleFromPathname(pathname: string): string | null {
  const segment = pathname.split("/")[1];
  return hasLocale(routing.locales, segment) ? segment : null;
}

function stripLocaleFromPathname(pathname: string): string {
  const locale = getLocaleFromPathname(pathname);
  if (!locale) return pathname;

  const stripped = pathname.slice(locale.length + 1);
  return stripped ? stripped : "/";
}

function withLocalePath(pathname: string, locale: string): string {
  return `/${locale}${pathname === "/" ? "" : pathname}`;
}

/**
 * Middleware to enforce the "Vault" rule for AVRA.
 * Ensures that external vendor requests stay isolated within the /external/ route tree.
 */
export function middleware(request: NextRequest) {
  const localeFromPath = getLocaleFromPathname(request.nextUrl.pathname);
  const normalizedPathname = stripLocaleFromPathname(request.nextUrl.pathname);

  const localeFromCookie = request.cookies.get("NEXT_LOCALE")?.value;
  const activeLocale = hasLocale(routing.locales, localeFromPath)
    ? localeFromPath
    : hasLocale(routing.locales, localeFromCookie)
      ? localeFromCookie
      : routing.defaultLocale;

  // Force-password-change always requires a setup token cookie.
  if (normalizedPathname.startsWith("/external/force-password-change")) {
    const setupToken = request.cookies.get("avra-vendor-setup")?.value;
    if (!setupToken) {
      const url = request.nextUrl.clone();
      url.pathname = withLocalePath("/external/portal", activeLocale);
      return NextResponse.redirect(url);
    }
  }

  const response = handleI18nRouting(request);

  // External portal token bootstrap.
  if (normalizedPathname.startsWith("/external/assessment/")) {
    const parts = normalizedPathname.split("/");
    const token = parts[parts.length - 1]; // Assume token is the last segment
    
    if (token && token.length > 20) {
      // Safely set the session cookie in the middleware response
      response.cookies.set("avra-vendor-token", token, {
        path: "/",
        maxAge: 60 * 60 * 24, // 24 hours
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
      });
    }
  }

  // 2. Identify Internal Admin Routes
  const isInternalRoute = 
    normalizedPathname.startsWith("/dashboard") || 
    normalizedPathname.startsWith("/vendors") || 
    normalizedPathname.startsWith("/settings") ||
    normalizedPathname.startsWith("/admin");

  // 3. Enforce "Vault" rule: If an admin route is hit with a vendor token, clear it to prevent lockout
  const vendorToken = request.cookies.get("avra-vendor-token");

  // Hardened admin restriction: external vendor sessions cannot access /admin.
  if (normalizedPathname.startsWith("/admin") && vendorToken) {
    const url = request.nextUrl.clone();
    url.pathname = withLocalePath("/external/portal", activeLocale);
    return NextResponse.redirect(url);
  }

  if (isInternalRoute && vendorToken) {
    // Break the redirect loop by clearing the vendor token
    // This allows admins to regain control by simply hitting /, /dashboard, or /vendors
    response.cookies.delete("avra-vendor-token");
    return response;
  }

  return response;
}

// See "Matching Paths" below to learn more
export const config = {
  matcher: [
    "/((?!api|trpc|_next|_vercel|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|site.webmanifest|.*\\..*).*)",
  ],
};
