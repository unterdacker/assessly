import "server-only";
import { env } from "@/lib/env";
import { getCachedLicense, updateHeartbeatStatus } from "./storage";
import { getOrCreateInstanceUuid, generateFingerprint } from "./instance";
import { verifyLicenseSignatureSync } from "./verifier";

export async function performHeartbeat(): Promise<void> {
  if (!env.LICENSE_SERVER_URL || !env.LICENSE_PUBLIC_KEY) return;
  if (process.env.LICENSE_OFFLINE_MODE === "true") return;

  const cache = await getCachedLicense();
  if (!cache?.encodedLicense) return;

  const verified = verifyLicenseSignatureSync(cache.encodedLicense, env.LICENSE_PUBLIC_KEY);
  if (!verified) return;

  const instanceUuid = await getOrCreateInstanceUuid();
  const fingerprint = generateFingerprint(instanceUuid, verified.payload.licenseId);

  try {
    const response = await fetch(`${env.LICENSE_SERVER_URL}/api/license/heartbeat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        licenseId: verified.payload.licenseId,
        instanceFingerprint: fingerprint,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (response.ok) {
      const result = await response.json() as { status: string; message?: string };
      await updateHeartbeatStatus(result.status, result.message ?? null);
    }
  } catch {
    // Heartbeat failure is non-fatal — app continues operating
  }
}
