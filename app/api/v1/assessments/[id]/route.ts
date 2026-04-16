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

const ENDPOINT = "/api/v1/assessments/{id}";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  let apiKeyId = "unknown";
  try {
    const auth = await authenticateApiKey(request);
    apiKeyId = auth.apiKeyId;
    requireScope(auth, "assessments:read");

    const assessment = await prisma.assessment.findFirst({
      where: { id, companyId: auth.companyId },
      select: {
        id: true,
        vendorId: true,
        status: true,
        riskLevel: true,
        complianceScore: true,
        lastAssessmentDate: true,
        createdAt: true,
        updatedAt: true,
        vendor: { select: { name: true, email: true } },
      },
    });

    if (!assessment) return apiError(404, "NOT_FOUND", "Assessment not found");

    logApiUsage(auth.apiKeyId, ENDPOINT, "GET", 200);
    return apiSuccess(assessment);
  } catch (err) {
    if (err instanceof ApiAuthError) {
      logApiUsage(apiKeyId, ENDPOINT, "GET", err.statusCode);
      return apiError(
        err.statusCode,
        err.code,
        err.message,
        err.statusCode === 429 ? { "Retry-After": "60" } : undefined,
      );
    }
    console.error("[API v1]", err);
    return apiError(500, "INTERNAL_ERROR", "An unexpected error occurred");
  }
}
