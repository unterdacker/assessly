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

const ENDPOINT = "/api/v1/vendors";

const createVendorSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  serviceType: z.string().min(1).max(100),
});

export async function GET(request: NextRequest) {
  let apiKeyId = "unknown";
  try {
    const auth = await authenticateApiKey(request);
    apiKeyId = auth.apiKeyId;
    requireScope(auth, "vendors:read");

    const vendors = await prisma.vendor.findMany({
      where: { companyId: auth.companyId },
      select: {
        id: true,
        name: true,
        email: true,
        serviceType: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    logApiUsage(auth.apiKeyId, ENDPOINT, "GET", 200);
    return apiSuccess(vendors);
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
    await requirePremiumScope(auth, "vendors:write");

    const body = await request.json().catch(() => null);
    if (body === null) return apiError(400, "INVALID_JSON", "Request body must be valid JSON");

    const parsed = createVendorSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Validation failed");
    }

    const { name, email, serviceType } = parsed.data;

    const vendor = await prisma.vendor.create({
      data: {
        companyId: auth.companyId,
        name,
        email,
        serviceType,
        createdBy: `api-key:${auth.apiKeyId}`,
      },
      select: {
        id: true,
        name: true,
        email: true,
        serviceType: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    logApiUsage(auth.apiKeyId, ENDPOINT, "POST", 201);
    return apiSuccess(vendor, 201);
  } catch (err) {
    if (err instanceof ApiAuthError) {
      logApiUsage(apiKeyId, ENDPOINT, "POST", err.statusCode);
      return apiError(err.statusCode, err.code, err.message);
    }
    console.error("[API v1]", err);
    return apiError(500, "INTERNAL_ERROR", "An unexpected error occurred");
  }
}
