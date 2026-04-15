import "server-only";

import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  authenticateApiKey,
  requireScope,
  requirePremiumScope,
  apiSuccess,
  apiError,
  logApiUsage,
  ApiAuthError,
} from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENDPOINT = "/api/v1/assessments";

const createAssessmentSchema = z.object({
  vendorId: z.string().cuid(),
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH"]),
  complianceScore: z.number().int().min(0).max(100).optional().default(0),
  status: z.enum(["PENDING", "IN_REVIEW", "COMPLETED"]).optional().default("PENDING"),
});

export async function GET(request: NextRequest) {
  let apiKeyId = "unknown";
  try {
    const auth = await authenticateApiKey(request);
    apiKeyId = auth.apiKeyId;
    requireScope(auth, "assessments:read");

    const assessments = await prisma.assessment.findMany({
      where: { companyId: auth.companyId },
      select: {
        id: true,
        vendorId: true,
        status: true,
        riskLevel: true,
        complianceScore: true,
        lastAssessmentDate: true,
        createdAt: true,
        updatedAt: true,
        vendor: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    logApiUsage(auth.apiKeyId, ENDPOINT, "GET", 200);
    return apiSuccess(assessments);
  } catch (err) {
    if (err instanceof ApiAuthError) {
      logApiUsage(apiKeyId, ENDPOINT, "GET", err.statusCode);
      return apiError(err.statusCode, err.code, err.message);
    }
    console.error("[API v1]", err);
    return apiError(500, "INTERNAL_ERROR", "An unexpected error occurred");
  }
}

export async function POST(request: NextRequest) {
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

    const parsed = createAssessmentSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Validation failed");
    }

    const { vendorId, riskLevel, complianceScore, status } = parsed.data;

    const vendor = await prisma.vendor.findFirst({
      where: { id: vendorId, companyId: auth.companyId },
      select: { id: true },
    });
    if (!vendor) return apiError(404, "VENDOR_NOT_FOUND", "Vendor not found");

    const existing = await prisma.assessment.findUnique({
      where: { vendorId },
      select: { id: true },
    });
    if (existing) {
      logApiUsage(auth.apiKeyId, ENDPOINT, "POST", 409);
      return apiError(409, "ASSESSMENT_EXISTS", "An assessment already exists for this vendor");
    }

    const assessment = await prisma.assessment.create({
      data: {
        companyId: auth.companyId,
        vendorId,
        riskLevel,
        complianceScore: complianceScore ?? 0,
        status: status ?? "PENDING",
        createdBy: `api-key:${auth.apiKeyId}`,
      },
      select: {
        id: true,
        vendorId: true,
        status: true,
        riskLevel: true,
        complianceScore: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    logApiUsage(auth.apiKeyId, ENDPOINT, "POST", 201);
    return apiSuccess(assessment, 201);
  } catch (err) {
    if (err instanceof ApiAuthError) {
      logApiUsage(apiKeyId, ENDPOINT, "POST", err.statusCode);
      return apiError(err.statusCode, err.code, err.message);
    }
    console.error("[API v1]", err);
    return apiError(500, "INTERNAL_ERROR", "An unexpected error occurred");
  }
}
