import createMiddleware from "next-intl/middleware";
import { hasLocale } from "next-intl";
import { NextResponse, NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import {
  canAccessPath,
  getRoleLandingPath,
  isExternalPath,
  isProtectedInternalPath,
  withLocalePath,
} from "@/lib/auth/permissions";
import { AUTH_SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/token";

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

/**
 * Middleware to enforce the "Vault" rule for AVRA.
 * Ensures that external vendor requests stay isolated within the /external/ route tree.
 */
export async function middleware(request: NextRequest) {
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
  const authToken = request.cookies.get(AUTH_SESSION_COOKIE_NAME)?.value || null;
  const authSession = await verifySessionToken(authToken);
  const vendorToken = request.cookies.get("avra-vendor-token")?.value || null;

  if (!authSession && authToken) {
    response.cookies.delete(AUTH_SESSION_COOKIE_NAME);
  }

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

  if (normalizedPathname.startsWith("/auth/sign-in") && authSession) {
    const url = request.nextUrl.clone();
    url.pathname = withLocalePath(getRoleLandingPath(authSession.role), activeLocale);
    return NextResponse.redirect(url);
  }

  if (isProtectedInternalPath(normalizedPathname)) {
    if (!authSession) {
      const url = request.nextUrl.clone();
      url.pathname = withLocalePath(vendorToken ? "/external/portal" : "/auth/sign-in", activeLocale);
      if (!vendorToken) {
        url.searchParams.set("next", normalizedPathname);
      }
      return NextResponse.redirect(url);
    }

    if (!canAccessPath(authSession.role, normalizedPathname)) {
      const url = request.nextUrl.clone();
      url.pathname = withLocalePath(
        authSession.role === "VENDOR" ? "/external/portal" : "/unauthorized",
        activeLocale,
      );
      return NextResponse.redirect(url);
    }

    if (vendorToken && authSession.role !== "VENDOR") {
      response.cookies.delete("avra-vendor-token");
    }
    return response;
  }

  if (isExternalPath(normalizedPathname) && authSession && authSession.role !== "VENDOR") {
    const url = request.nextUrl.clone();
    url.pathname = withLocalePath(getRoleLandingPath(authSession.role), activeLocale);
    return NextResponse.redirect(url);
  }

  return response;
}

// See "Matching Paths" below to learn more
export const config = {
  matcher: [
    "/((?!api|trpc|_next|_vercel|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|site.webmanifest|.*\\..*).*)",
  ],
};
