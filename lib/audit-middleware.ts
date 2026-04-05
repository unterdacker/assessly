/**
 * Audit Middleware for API Routes
 *
 * Wraps any Next.js API route handler to automatically capture the 5-W
 * context (Who, When, What, Where, Outcome) and emit structured JSON logs.
 *
 * Features:
 *   - Generates/propagates a trace_id (X-Trace-Id header) for request correlation
 *   - Captures source IP (GDPR-truncated), user agent, route, method
 *   - Measures response latency
 *   - Logs both success and failure outcomes
 *   - PII is scrubbed before logging
 *
 * Usage in an API route:
 *   import { withAuditMiddleware } from "@/lib/audit-middleware";
 *   export const GET = withAuditMiddleware(async (request, context) => {
 *     // your handler logic
 *     return NextResponse.json({ ok: true });
 *   });
 */

import { NextRequest, NextResponse } from "next/server";
import { AuditLogger, AuditCategory } from "@/lib/structured-logger";
import { truncateIp } from "@/lib/audit-sanitize";
import { AUTH_SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/token";

// ---------------------------------------------------------------------------
// Trace ID generation
// ---------------------------------------------------------------------------

function generateTraceId(): string {
  // Use crypto.randomUUID if available (Node 19+), else fallback
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `trace-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// Request context extraction
// ---------------------------------------------------------------------------

type RequestContext = {
  traceId: string;
  sourceIp: string | null;
  userAgent: string | null;
  method: string;
  pathname: string;
  userId: string | null;
  role: string | null;
};

async function extractRequestContext(request: NextRequest): Promise<RequestContext> {
  // Trace ID: use incoming header or generate a new one
  const traceId =
    request.headers.get("x-trace-id") ??
    request.headers.get("x-request-id") ??
    generateTraceId();

  // Source IP: truncated per GDPR Recital 30
  const rawIp =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    null;
  const sourceIp = truncateIp(rawIp);

  const userAgent = request.headers.get("user-agent") ?? null;
  const method = request.method;
  const pathname = request.nextUrl.pathname;

  // Attempt to identify the caller from the session cookie
  let userId: string | null = null;
  let role: string | null = null;
  try {
    const token = request.cookies.get(AUTH_SESSION_COOKIE_NAME)?.value ?? null;
    if (token) {
      const claims = await verifySessionToken(token);
      if (claims) {
        userId = claims.uid;
        role = claims.role;
      }
    }
  } catch {
    // Session not available — anonymous request
  }

  return { traceId, sourceIp, userAgent, method, pathname, userId, role };
}

// ---------------------------------------------------------------------------
// Route → AuditCategory mapping
// ---------------------------------------------------------------------------

function categorizeRoute(pathname: string): AuditCategory {
  if (pathname.includes("/auth") || pathname.includes("/session")) {
    return AuditCategory.AUTH;
  }
  if (pathname.includes("/admin") || pathname.includes("/iam") || pathname.includes("/users")) {
    return AuditCategory.ACCESS_CONTROL;
  }
  if (pathname.includes("/settings") || pathname.includes("/config")) {
    return AuditCategory.CONFIGURATION;
  }
  if (pathname.includes("/health") || pathname.includes("/cron")) {
    return AuditCategory.SYSTEM_HEALTH;
  }
  return AuditCategory.DATA_OPERATIONS;
}

// ---------------------------------------------------------------------------
// Middleware wrapper
// ---------------------------------------------------------------------------

type RouteHandler = (
  request: NextRequest,
  context?: unknown,
) => Promise<NextResponse> | NextResponse;

export function withAuditMiddleware(handler: RouteHandler): RouteHandler {
  return async (request: NextRequest, routeContext?: unknown): Promise<NextResponse> => {
    const startTime = Date.now();
    const ctx = await extractRequestContext(request);
    const category = categorizeRoute(ctx.pathname);

    try {
      const response = await handler(request, routeContext);
      const durationMs = Date.now() - startTime;

      // Set trace ID on response for end-to-end correlation
      response.headers.set("x-trace-id", ctx.traceId);

      AuditLogger.log({
        category,
        action: `api.${ctx.method.toLowerCase()}.${ctx.pathname}`,
        status: response.status >= 400 ? "failure" : "success",
        userId: ctx.userId,
        role: ctx.role,
        sourceIp: ctx.sourceIp,
        traceId: ctx.traceId,
        responseCode: response.status,
        durationMs,
        details: {
          method: ctx.method,
          pathname: ctx.pathname,
          userAgent: ctx.userAgent,
        },
      });

      return response;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const err = error instanceof Error ? error : new Error(String(error));

      AuditLogger.log({
        category: AuditCategory.SYSTEM_HEALTH,
        action: `api.${ctx.method.toLowerCase()}.${ctx.pathname}`,
        status: "failure",
        userId: ctx.userId,
        role: ctx.role,
        sourceIp: ctx.sourceIp,
        traceId: ctx.traceId,
        responseCode: 500,
        durationMs,
        error: err,
        message: `Unhandled error in ${ctx.method} ${ctx.pathname}`,
      });

      throw error;
    }
  };
}

/**
 * Helper to extract trace_id from headers() in server actions.
 * Returns a generated trace_id if none is present.
 */
export function getTraceId(headerStore: Headers): string {
  return (
    headerStore.get("x-trace-id") ??
    headerStore.get("x-request-id") ??
    generateTraceId()
  );
}

export { generateTraceId };
