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

const ENDPOINT = "/api/v1/vendors/{id}";

const updateVendorSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    email: z.string().email().optional(),
    serviceType: z.string().min(1).max(100).optional(),
    officialName: z.string().max(200).optional().nullable(),
    registrationId: z.string().max(100).optional().nullable(),
    headquartersLocation: z.string().max(200).optional().nullable(),
    securityOfficerName: z.string().max(200).optional().nullable(),
    securityOfficerEmail: z.string().email().max(200).optional().nullable(),
    dpoName: z.string().max(200).optional().nullable(),
    dpoEmail: z.string().email().max(200).optional().nullable(),
  })
  .refine(
    (d) => Object.values(d).some((v) => v !== undefined),
    "At least one field must be provided",
  );

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  let apiKeyId = "unknown";
  try {
    const auth = await authenticateApiKey(request);
    apiKeyId = auth.apiKeyId;
    requireScope(auth, "vendors:read");

    const vendor = await prisma.vendor.findFirst({
      where: { id, companyId: auth.companyId },
      select: {
        id: true,
        name: true,
        email: true,
        serviceType: true,
        officialName: true,
        registrationId: true,
        headquartersLocation: true,
        securityOfficerName: true,
        securityOfficerEmail: true,
        dpoName: true,
        dpoEmail: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!vendor) return apiError(404, "NOT_FOUND", "Vendor not found");

    logApiUsage(auth.apiKeyId, ENDPOINT, "GET", 200);
    return apiSuccess(vendor);
  } catch (err) {
    if (err instanceof ApiAuthError) {
      logApiUsage(apiKeyId, ENDPOINT, "GET", err.statusCode);
      return apiError(err.statusCode, err.code, err.message);
    }
    console.error("[API v1]", err);
    return apiError(500, "INTERNAL_ERROR", "An unexpected error occurred");
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  let apiKeyId = "unknown";
  try {
    if (!request.headers.get("content-type")?.includes("application/json")) {
      return apiError(415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json");
    }

    const auth = await authenticateApiKey(request);
    apiKeyId = auth.apiKeyId;
    await requirePremiumScope(auth, "vendors:write");

    const body = await request.json().catch(() => null);
    if (body === null) return apiError(400, "INVALID_JSON", "Request body must be valid JSON");

    const parsed = updateVendorSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Validation failed");
    }

    const existing = await prisma.vendor.findFirst({
      where: { id, companyId: auth.companyId },
      select: { id: true },
    });
    if (!existing) return apiError(404, "NOT_FOUND", "Vendor not found");

    const vendor = await prisma.vendor.update({
      where: { id },
      data: parsed.data,
      select: {
        id: true,
        name: true,
        email: true,
        serviceType: true,
        officialName: true,
        registrationId: true,
        headquartersLocation: true,
        updatedAt: true,
      },
    });

    logApiUsage(auth.apiKeyId, ENDPOINT, "PATCH", 200);
    return apiSuccess(vendor);
  } catch (err) {
    if (err instanceof ApiAuthError) {
      logApiUsage(apiKeyId, ENDPOINT, "PATCH", err.statusCode);
      return apiError(err.statusCode, err.code, err.message);
    }
    console.error("[API v1]", err);
    return apiError(500, "INTERNAL_ERROR", "An unexpected error occurred");
  }
}
