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
import { AUTH_SESSION_COOKIE_NAME, shouldSecureCookie, verifySessionToken } from "@/lib/auth/token";

const handleI18nRouting = createMiddleware(routing);

// ---------------------------------------------------------------------------
// Security headers applied to every page response
// ---------------------------------------------------------------------------

const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

function applySecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  // Disable the legacy broken XSS auditor (modern browsers use CSP instead)
  response.headers.set("X-XSS-Protection", "0");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()",
  );
  response.headers.set("Content-Security-Policy", CSP_DIRECTIVES);
  if (process.env.NODE_ENV === "production") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload",
    );
  }
  return response;
}

// ---------------------------------------------------------------------------
// Locale helpers
// ---------------------------------------------------------------------------

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
 * Security headers are applied to every response via applySecurityHeaders().
 */
async function _middleware(request: NextRequest): Promise<NextResponse> {
  // Server Actions are POSTs with a Next-Action header. Locale routing (rewrites
  // / redirects) must be skipped so Next.js can resolve the action by its hash.
  if (request.headers.get("Next-Action")) {
    return NextResponse.next();
  }

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
      // Bootstrap: write the token from the invite URL into a secure HttpOnly cookie.
      // SameSite=Lax so the cookie is sent when the vendor follows an email link
      // (top-level navigation) but not on cross-site sub-resource requests.
      response.cookies.set("avra-vendor-token", token, {
        path: "/",
        maxAge: 60 * 60 * 24, // Conservative 24-hour cap; refreshed on re-login
        sameSite: "lax",
        secure: shouldSecureCookie(),
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

export async function middleware(request: NextRequest): Promise<NextResponse> {
  return applySecurityHeaders(await _middleware(request));
}

// See "Matching Paths" below to learn more
export const config = {
  matcher: [
    "/((?!api|trpc|_next|_vercel|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|site.webmanifest|.*\\..*).*)",
  ],
};
