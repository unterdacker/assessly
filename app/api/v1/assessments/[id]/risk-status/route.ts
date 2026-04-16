import "server-only";

import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  authenticateApiKey,
  requirePremiumScope,
  apiSuccess,
  apiError,
  logApiUsage,
  ApiAuthError,
} from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENDPOINT = "/api/v1/assessments/{id}/risk-status";

const riskStatusSchema = z
  .object({
    status: z.enum(["PENDING", "IN_REVIEW", "COMPLETED"]).optional(),
    riskLevel: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  })
  .refine(
    (d) => d.status !== undefined || d.riskLevel !== undefined,
    "At least one of 'status' or 'riskLevel' must be provided",
  );

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  let apiKeyId = "unknown";
  try {
    if (!request.headers.get("content-type")?.includes("application/json")) {
      return apiError(415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json");
    }

    const auth = await authenticateApiKey(request);
    apiKeyId = auth.apiKeyId;
    await requirePremiumScope(auth, "assessments:write");

    const body = await request.json().catch(() => null);
    if (body === null) return apiError(400, "INVALID_JSON", "Request body must be valid JSON");

    const parsed = riskStatusSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Validation failed");
    }

    const existing = await prisma.assessment.findFirst({
      where: { id, companyId: auth.companyId },
      select: { id: true },
    });
    if (!existing) return apiError(404, "NOT_FOUND", "Assessment not found");

    const assessment = await prisma.assessment.update({
      where: { id },
      data: {
        ...(parsed.data.status !== undefined && { status: parsed.data.status }),
        ...(parsed.data.riskLevel !== undefined && { riskLevel: parsed.data.riskLevel }),
      },
      select: {
        id: true,
        vendorId: true,
        status: true,
        riskLevel: true,
        complianceScore: true,
        updatedAt: true,
      },
    });

    logApiUsage(auth.apiKeyId, ENDPOINT, "PATCH", 200);
    return apiSuccess(assessment);
  } catch (err) {
    if (err instanceof ApiAuthError) {
      logApiUsage(apiKeyId, ENDPOINT, "PATCH", err.statusCode);
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
