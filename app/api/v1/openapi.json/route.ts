import "server-only";
import { type NextRequest } from "next/server";
import { openapiSpec } from "@/lib/openapi/spec";
import { readClientIp } from "@/lib/rate-limit";
import { consumeIpRequest } from "@/lib/api-rate-limit";
import { AuditLogger } from "@/lib/structured-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  // Per-IP rate limit (shared with API key rate limiter)
  const ip = readClientIp({ get: (name: string) => request.headers.get(name) });
  if (consumeIpRequest(ip)) {
    return new Response(
      JSON.stringify({
        data: null,
        error: { code: "RATE_LIMIT_EXCEEDED", message: "Too many requests" },
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": "60",
        },
      },
    );
  }

  // Audit log access to OpenAPI spec
  AuditLogger.systemHealth("OPENAPI_SPEC_ACCESSED", "success", {
    sourceIp: ip,
    details: { endpoint: "/api/v1/openapi.json" },
  });

  const body = JSON.stringify(openapiSpec, null, 2);
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
