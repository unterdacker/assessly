import "server-only";

import { type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  authenticateApiKey,
  requireScope,
  apiSuccess,
  apiError,
  logApiUsage,
  ApiAuthError,
} from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENDPOINT = "/api/v1/metrics";

export async function GET(request: NextRequest) {
  let apiKeyId = "unknown";
  try {
    const auth = await authenticateApiKey(request);
    apiKeyId = auth.apiKeyId;
    requireScope(auth, "metrics:read");

    const apiKeys = await prisma.apiKey.findMany({
      where: { companyId: auth.companyId },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        scopes: true,
        usageCount: true,
        lastUsedAt: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { usageCount: "desc" },
    });

    const totalRequests = apiKeys.reduce((sum, k) => sum + k.usageCount, 0);
    const activeKeys = apiKeys.filter((k) => k.isActive).length;

    logApiUsage(auth.apiKeyId, ENDPOINT, "GET", 200);
    return apiSuccess({
      apiKeys,
      totalRequests,
      activeKeys,
      totalKeys: apiKeys.length,
    });
  } catch (err) {
    if (err instanceof ApiAuthError) {
      logApiUsage(apiKeyId, ENDPOINT, "GET", err.statusCode);
      return apiError(err.statusCode, err.code, err.message);
    }
    console.error("[API v1]", err);
    return apiError(500, "INTERNAL_ERROR", "An unexpected error occurred");
  }
}
