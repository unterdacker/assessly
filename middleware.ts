import createMiddleware from "next-intl/middleware";
import { hasLocale } from "next-intl";
import { NextResponse, NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { NEXT_THEMES_FOUC_HASH } from "@/lib/csp-hashes";
import {
  canAccessPath,
  getRoleLandingPath,
  INTERNAL_READ_ROLES,
  INTERNAL_WRITE_ROLES,
  isExternalPath,
  isProtectedInternalPath,
  withLocalePath,
} from "@/lib/auth/permissions";
import { AUTH_SESSION_COOKIE_NAME, shouldSecureCookie, verifySessionToken } from "@/lib/auth/token";

const handleI18nRouting = createMiddleware(routing);
const SAFE_HTTP_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// ---------------------------------------------------------------------------
// Edge-compatible structured logger (no Node.js crypto dependency)
// Emits JSON lines consistent with the AuditLogger for log aggregation.
// ---------------------------------------------------------------------------

function emitMiddlewareLog(entry: {
  event_type: string;
  action_name: string;
  status: "success" | "failure";
  user_id?: string | null;
  role?: string | null;
  source_ip?: string | null;
  pathname?: string;
  message?: string;
  response_code?: number;
}) {
  const log = {
    timestamp: new Date().toISOString(),
    level: entry.status === "failure" ? "warn" : "info",
    event_type: entry.event_type,
    action_name: entry.action_name,
    service_name: "venshield-compliance",
    environment: process.env.NODE_ENV ?? "development",
    status: entry.status,
    user_id: entry.user_id ?? null,
    role: entry.role ?? null,
    source_ip: entry.source_ip ?? null,
    response_code: entry.response_code ?? null,
    details: { pathname: entry.pathname },
    message: entry.message,
  };
  // Edge Runtime: console.log writes to stdout as JSON in most runtimes
  console.log(JSON.stringify(log));
}

// ---------------------------------------------------------------------------
// Security headers applied to every page response
// ---------------------------------------------------------------------------

/**
 * Generates a cryptographically random 16-byte nonce, base64-encoded.
 * Uses crypto.getRandomValues() which is available in the Edge Runtime.
 */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""));
}

/**
 * Builds the Content-Security-Policy header value for a given per-request nonce.
 * 'unsafe-inline' is intentionally omitted from script-src; the nonce is used instead.
 */
export function buildCspHeader(nonce: string): string {
  return [
    "default-src 'self'",
    // TODO: Remove 'unsafe-eval' once verified unnecessary in production.
    //       Required by Next.js development mode (HMR / fast-refresh eval-based source maps)
    //       but production builds should not need it. Gate behind NODE_ENV in a future pass.
    `script-src 'self' 'nonce-${nonce}' ${NEXT_THEMES_FOUC_HASH} 'unsafe-eval'`,
    // TODO: Replace 'unsafe-inline' with a style nonce in a future pass.
    //       Currently required for Tailwind CSS utility classes injected at runtime.
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
}

function applySecurityHeaders(response: NextResponse, nonce: string): NextResponse {
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  // Disable the legacy broken XSS auditor (modern browsers use CSP instead)
  response.headers.set("X-XSS-Protection", "0");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()",
  );
  response.headers.set("Content-Security-Policy", buildCspHeader(nonce));
  // x-nonce response header: also forwarded as a request header (see _middleware).
  // Single-use per request; safe to expose in the response.
  response.headers.set("x-nonce", nonce);
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
 * Middleware to enforce the "Vault" rule for Venshield.
 * Ensures that external vendor requests stay isolated within the /external/ route tree.
 * Security headers are applied to every response via applySecurityHeaders().
 */
async function _middleware(request: NextRequest, nonce: string): Promise<NextResponse> {
  const localeFromPath = getLocaleFromPathname(request.nextUrl.pathname);
  const normalizedPathname = stripLocaleFromPathname(request.nextUrl.pathname);
  const isSafeMethod = SAFE_HTTP_METHODS.has(request.method.toUpperCase());

  // Server Actions are POSTs with a Next-Action header. Locale routing (rewrites
  // / redirects) must be skipped so Next.js can resolve the action by its hash.
  if (request.headers.get("Next-Action")) {
    // Auth pages (sign-in, MFA verify) and the vendor first-login setup page
    // submit server actions while the user has no session yet — let them through
    // without an auth check. The actions themselves validate any required tokens
    // (e.g. venshield-vendor-setup cookie for force-password-change).
    if (
      normalizedPathname.startsWith("/auth/") ||
      /^\/vendor\/accept-invite$/.test(normalizedPathname) ||
      normalizedPathname === "/external/portal" ||
      normalizedPathname.startsWith("/external/force-password-change")
    ) {
      return NextResponse.next();
    }

    const authToken = request.cookies.get(AUTH_SESSION_COOKIE_NAME)?.value || null;
    const authSession = await verifySessionToken(authToken);

    if (!authSession) {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }

    if (!canAccessPath(authSession.role, normalizedPathname)) {
      emitMiddlewareLog({
        event_type: "ACCESS_CONTROL",
        action_name: "middleware.server_action.access_denied",
        status: "failure",
        user_id: authSession.uid,
        role: authSession.role,
        pathname: normalizedPathname,
        source_ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        message: `Role ${authSession.role} denied server action access to ${normalizedPathname}`,
        response_code: 403,
      });
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    if (!INTERNAL_WRITE_ROLES.includes(authSession.role) && !isSafeMethod) {
      emitMiddlewareLog({
        event_type: "ACCESS_CONTROL",
        action_name: "middleware.server_action.read_only_write_blocked",
        status: "failure",
        user_id: authSession.uid,
        role: authSession.role,
        pathname: normalizedPathname,
        source_ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        message: `Blocked non-read server action method ${request.method.toUpperCase()} for read-only role ${authSession.role} on ${normalizedPathname}`,
        response_code: 403,
      });
      return NextResponse.json({ error: "FORBIDDEN_READ_ONLY" }, { status: 403 });
    }

    return NextResponse.next();
  }

  const localeFromCookie = request.cookies.get("NEXT_LOCALE")?.value;
  const activeLocale = hasLocale(routing.locales, localeFromPath)
    ? localeFromPath
    : hasLocale(routing.locales, localeFromCookie)
      ? localeFromCookie
      : routing.defaultLocale;

  // Force-password-change always requires a setup token cookie.
  if (normalizedPathname.startsWith("/external/force-password-change")) {
    const setupToken = request.cookies.get("venshield-vendor-setup")?.value;
    if (!setupToken) {
      const url = request.nextUrl.clone();
      url.pathname = withLocalePath("/external/portal", activeLocale);
      return NextResponse.redirect(url);
    }
  }

  // For non-redirect responses, forward the nonce as a request header so server
  // components can read it via `import { headers } from 'next/headers'; headers().get('x-nonce')`.
  const i18nResponse = handleI18nRouting(request);
  let response: NextResponse;

  if (i18nResponse.status >= 300 && i18nResponse.status < 400) {
    // Locale redirect — no page is rendered, nonce forwarding is not needed.
    response = i18nResponse;
  } else {
    // Pass-through to a page. Create a new response that forwards the nonce
    // as a request header, then copy next-intl's locale cookies and headers.
    const headersWithNonce = new Headers(request.headers);
    headersWithNonce.set("x-nonce", nonce);
    response = NextResponse.next({ request: { headers: headersWithNonce } });
    // Copy locale cookies next-intl may have set (e.g. NEXT_LOCALE).
    i18nResponse.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
    // Copy non-routing response headers from the i18n response.
    // next-intl propagates the active locale through the URL prefix and the NEXT_LOCALE
    // cookie — not through x-middleware-request-* / x-middleware-override-headers.
    // Excluding those headers preserves the nonce forwarding we've already written
    // without silently dropping locale context.
    i18nResponse.headers.forEach((value, key) => {
      if (
        !key.startsWith("x-middleware-request-") &&
        key !== "x-middleware-override-headers" &&
        key.toLowerCase() !== "set-cookie"
      ) {
        response.headers.set(key, value);
      }
    });
  }
  const authToken = request.cookies.get(AUTH_SESSION_COOKIE_NAME)?.value || null;

  const authSession = await verifySessionToken(authToken);
  const vendorToken = request.cookies.get("venshield-vendor-token")?.value || null;

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
      response.cookies.set("venshield-vendor-token", token, {
        path: "/",
        maxAge: 60 * 60 * 24, // Conservative 24-hour cap; refreshed on re-login
        sameSite: "lax",
        secure: shouldSecureCookie(),
        httpOnly: true,
      });
    }
  }

  if (normalizedPathname.startsWith("/auth/sign-in") && authSession && authSession.role !== "VENDOR") {
    const url = request.nextUrl.clone();
    url.pathname = withLocalePath(getRoleLandingPath(authSession.role), activeLocale);
    return NextResponse.redirect(url);
  }

  if (isProtectedInternalPath(normalizedPathname)) {
    if (!authSession) {
      emitMiddlewareLog({
        event_type: "AUTH",
        action_name: "middleware.unauthenticated_redirect",
        status: "failure",
        pathname: normalizedPathname,
        source_ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        message: "Unauthenticated access to protected path — redirecting to sign-in",
        response_code: 302,
      });
      const url = request.nextUrl.clone();
      url.pathname = withLocalePath(vendorToken ? "/external/portal" : "/auth/sign-in", activeLocale);
      if (!vendorToken) {
        url.searchParams.set("next", normalizedPathname);
      }
      return NextResponse.redirect(url);
    }

    if (!canAccessPath(authSession.role, normalizedPathname)) {
      emitMiddlewareLog({
        event_type: "ACCESS_CONTROL",
        action_name: "middleware.access_denied",
        status: "failure",
        user_id: authSession.uid,
        role: authSession.role,
        pathname: normalizedPathname,
        source_ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        message: `Role ${authSession.role} denied access to ${normalizedPathname}`,
        response_code: 403,
      });
      const url = request.nextUrl.clone();
      const isAuditLogsPath =
        normalizedPathname === "/admin/audit-logs" ||
        normalizedPathname.startsWith("/admin/audit-logs/");
      url.pathname = withLocalePath(
        authSession.role === "VENDOR"
          ? "/external/portal"
          : isAuditLogsPath
            ? "/dashboard"
            : "/unauthorized",
        activeLocale,
      );
      return NextResponse.redirect(url);
    }

    if (!INTERNAL_WRITE_ROLES.includes(authSession.role) && !isSafeMethod) {
      emitMiddlewareLog({
        event_type: "ACCESS_CONTROL",
        action_name: "middleware.read_only_write_blocked",
        status: "failure",
        user_id: authSession.uid,
        role: authSession.role,
        pathname: normalizedPathname,
        source_ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        message: `Blocked non-read method ${request.method.toUpperCase()} for read-only role ${authSession.role} on ${normalizedPathname}`,
        response_code: 403,
      });
      return NextResponse.json({ error: "FORBIDDEN_READ_ONLY" }, { status: 403 });
    }

    if (vendorToken && authSession.role !== "VENDOR") {
      response.cookies.delete("venshield-vendor-token");
    }
    return response;
  }

  if (isExternalPath(normalizedPathname) && authSession && authSession.role !== "VENDOR") {
    const isInternalPreviewPath =
      normalizedPathname === "/external/portal" ||
      normalizedPathname.startsWith("/external/assessment/") ||
      normalizedPathname.startsWith("/external/force-password-change");

    if (isInternalPreviewPath && INTERNAL_READ_ROLES.includes(authSession.role)) {
      return response;
    }

    const url = request.nextUrl.clone();
    url.pathname = withLocalePath(getRoleLandingPath(authSession.role), activeLocale);
    return NextResponse.redirect(url);
  }

  return response;
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const nonce = generateNonce();
  return applySecurityHeaders(await _middleware(request, nonce), nonce);
}

// See "Matching Paths" below to learn more
export const config = {
  matcher: [
    "/((?!api|trpc|_next|_vercel|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|site.webmanifest|.*\\..*).*)",
  ],
};
