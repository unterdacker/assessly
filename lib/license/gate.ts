import "server-only";
import { env } from "@/lib/env";
import { getCachedLicense } from "./storage";
import { verifyLicenseSignatureSync, isLicenseExpired } from "./verifier";
import type { LicenseCheck } from "./types";

export async function checkLicense(): Promise<LicenseCheck> {
  if (process.env.NODE_ENV === "development") {
    return { allowed: true, status: "valid" };
  }
  if (!env.LICENSE_PUBLIC_KEY) {
    return { allowed: false, status: "missing", reason: "No license configured" };
  }

  const cache = await getCachedLicense();
  if (!cache?.encodedLicense) {
    return { allowed: false, status: "missing", reason: "No license installed. Set LICENSE_KEY environment variable." };
  }

  const verified = verifyLicenseSignatureSync(cache.encodedLicense, env.LICENSE_PUBLIC_KEY);
  if (!verified) {
    return { allowed: false, status: "invalid", reason: "License signature is invalid." };
  }

  if (isLicenseExpired(verified.payload.expiresAt)) {
    return { allowed: false, status: "expired", reason: "License has expired. Please renew." };
  }

  if (cache.cachedStatus === "revoked") {
    return { allowed: false, status: "revoked", reason: cache.cachedMessage ?? "License revoked." };
  }

  if (cache.cachedStatus === "overlimit") {
    return { allowed: false, status: "overlimit", reason: "Instance limit exceeded." };
  }

  return { allowed: true, status: "valid" };
}
