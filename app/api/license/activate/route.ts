import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getOrCreateInstanceUuid, generateFingerprint } from "@/lib/license/instance";
import { verifyLicenseSignatureSync, isLicenseExpired } from "@/lib/license/verifier";
import { cacheLicense } from "@/lib/license/storage";
import { getAuthSessionFromRequest } from "@/lib/auth/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await getAuthSessionFromRequest(request);
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  let body: { licenseKey?: string };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { licenseKey } = body;
  if (!licenseKey) return NextResponse.json({ error: "licenseKey required" }, { status: 400 });
  if (!env.LICENSE_PUBLIC_KEY) return NextResponse.json({ error: "License verification not configured" }, { status: 503 });

  const verified = verifyLicenseSignatureSync(licenseKey, env.LICENSE_PUBLIC_KEY);
  if (!verified) return NextResponse.json({ error: "Invalid license key" }, { status: 400 });
  if (isLicenseExpired(verified.payload.expiresAt)) return NextResponse.json({ error: "License key has expired" }, { status: 400 });

  if (env.LICENSE_SERVER_URL && process.env.LICENSE_OFFLINE_MODE !== "true") {
    const instanceUuid = await getOrCreateInstanceUuid();
    const fingerprint = generateFingerprint(instanceUuid, verified.payload.licenseId);

    const response = await fetch(`${env.LICENSE_SERVER_URL}/api/license/activate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ encodedLicense: licenseKey, instanceFingerprint: fingerprint }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: "Activation failed" })) as { error?: string };
      return NextResponse.json({ error: err.error ?? "Activation failed" }, { status: response.status });
    }

    await cacheLicense(instanceUuid, licenseKey);
  } else {
    const instanceUuid = await getOrCreateInstanceUuid();
    await cacheLicense(instanceUuid, licenseKey);
  }

  return NextResponse.json({ status: "activated", plan: verified.payload.plan });
}
