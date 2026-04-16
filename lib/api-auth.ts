import "server-only";

import crypto from "crypto";
import { after } from "next/server";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isPremiumPlan } from "@/lib/plan-gate";
import { consumeApiKeyRequest, consumeIpRequest, normalizeIp } from "@/lib/api-rate-limit";
import { AuditLogger } from "@/lib/structured-logger";
import { readClientIp } from "@/lib/rate-limit";
import { hashApiKey } from "@/modules/api-keys/lib/key-generator";

export type ApiScope =
  | "vendors:read"
  | "vendors:write"
  | "assessments:read"
  | "assessments:write"
  | "metrics:read";

export const ALL_SCOPES: ApiScope[] = [
  "vendors:read",
  "vendors:write",
  "assessments:read",
  "assessments:write",
  "metrics:read",
];

export const PREMIUM_SCOPES = new Set<ApiScope>([
  "vendors:write",
  "assessments:write",
]);

export type ApiKeyPrincipal = {
  apiKeyId: string;
  companyId: string;
  scopes: ApiScope[];
  keyName: string;
};

export class ApiAuthError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = "ApiAuthError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function apiSuccess<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ data, error: null }, { status });
}

export function apiError(
  status: number,
  code: string,
  message: string,
  extraHeaders?: Record<string, string>,
): NextResponse {
  const init: ResponseInit = { status };
  if (extraHeaders) init.headers = extraHeaders;
  return NextResponse.json({ data: null, error: { code, message } }, init);
}

/**
 * Authenticates a request using a Bearer API key.
 * Throws ApiAuthError on any failure.
 */
export async function authenticateApiKey(
  request: NextRequest | Request,
): Promise<ApiKeyPrincipal> {
  const authHeader = request.headers.get("authorization");

  const rawKey = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;

  // Per-IP rate limit — checked before key validation to prevent timing-based
  // key enumeration attacks
  const ip = readClientIp({ get: (name: string) => request.headers.get(name) });
  if (consumeIpRequest(ip)) {
    AuditLogger.auth("API_RATE_LIMIT_EXCEEDED", "failure", {
      sourceIp: normalizeIp(ip),
      details: { reason: "IP_LIMIT" },
      entityType: "ApiKey",
      entityId: "unknown",
      securityIncident: true,
    });
    throw new ApiAuthError(
      429,
      "RATE_LIMIT_EXCEEDED",
      "Too many requests. Please try again later.",
    );
  }

  if (!rawKey || !rawKey.startsWith("vs_live_") || rawKey.length !== 72) {
    throw new ApiAuthError(
      401,
      "INVALID_API_KEY_FORMAT",
      "Authorization header must contain a valid Bearer API key (vs_live_...)",
    );
  }

  const keyHash = hashApiKey(rawKey);

  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash },
    select: {
      id: true,
      companyId: true,
      scopes: true,
      name: true,
      isActive: true,
      expiresAt: true,
    },
  });

  const truncatedIp = ip.replace(/\.\d+$/, ".0").replace(/:[\da-f]+$/, ":0");

  if (!apiKey || !apiKey.isActive) {
    AuditLogger.auth("API_AUTH_FAILED", "failure", {
      userId: "api-key",
      sourceIp: truncatedIp,
      details: {
        reason: !apiKey ? "KEY_NOT_FOUND" : "KEY_INACTIVE",
      },
      entityType: "ApiKey",
      entityId: "unknown",
    });

    throw new ApiAuthError(401, "INVALID_API_KEY", "API key is invalid or inactive");
  }

  if (apiKey.expiresAt && apiKey.expiresAt <= new Date()) {
    AuditLogger.auth("API_AUTH_FAILED", "failure", {
      userId: apiKey.id,
      sourceIp: truncatedIp,
      details: { reason: "KEY_EXPIRED" },
      entityType: "ApiKey",
      entityId: apiKey.id,
    });

    throw new ApiAuthError(401, "API_KEY_EXPIRED", "API key has expired");
  }

  const exceeded = consumeApiKeyRequest(apiKey.id);
  if (exceeded) {
    AuditLogger.auth("API_RATE_LIMIT_EXCEEDED", "failure", {
      sourceIp: normalizeIp(ip),
      details: { reason: "KEY_LIMIT" },
      entityType: "ApiKey",
      entityId: apiKey.id,
      securityIncident: true,
    });
    throw new ApiAuthError(429, "RATE_LIMIT_EXCEEDED", "Too many requests. Please try again later.");
  }

  after(async () => {
    await prisma.apiKey
      .update({
        where: { id: apiKey.id },
        data: {
          lastUsedAt: new Date(),
          usageCount: { increment: 1 },
        },
      })
      .catch(() => undefined);
  });

  return {
    apiKeyId: apiKey.id,
    companyId: apiKey.companyId,
    scopes: apiKey.scopes as ApiScope[],
    keyName: apiKey.name,
  };
}

export function requireScope(
  principal: ApiKeyPrincipal,
  scope: ApiScope,
): void {
  if (!principal.scopes.includes(scope)) {
    throw new ApiAuthError(
      403,
      "INSUFFICIENT_SCOPE",
      `Scope '${scope}' is required for this endpoint`,
    );
  }
}

/**
 * Requires scope AND premium plan.
 * Use for write endpoints (vendors:write, assessments:write).
 */
export async function requirePremiumScope(
  principal: ApiKeyPrincipal,
  scope: ApiScope,
): Promise<void> {
  requireScope(principal, scope);
  const premium = await isPremiumPlan(principal.companyId);
  if (!premium) {
    throw new ApiAuthError(
      403,
      "PREMIUM_REQUIRED",
      "This endpoint requires a Premium plan",
    );
  }
}

/**
 * Writes to ApiKeyUsageLog with 90-day retention.
 * Sanitizes endpoint to replace cuid path params with {id}.
 */
export function logApiUsage(
  apiKeyId: string,
  endpoint: string,
  method: string,
  statusCode: number,
): void {
  const sanitizedEndpoint = endpoint.replace(
    /\/[a-z0-9]{20,}\b/gi,
    "/{id}",
  );
  const retentionUntil = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

  after(async () => {
    await prisma.apiKeyUsageLog
      .create({
        data: {
          id: crypto.randomUUID(),
          apiKeyId,
          endpoint: sanitizedEndpoint,
          method: method.toUpperCase(),
          statusCode,
          retentionUntil,
        },
      })
      .catch(() => undefined);
  });
}
