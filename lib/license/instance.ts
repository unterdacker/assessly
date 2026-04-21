import "server-only";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

/**
 * Returns a stable UUID for this VenShield instance.
 * The UUID is stored in the LicenseCache table (singleton row).
 *
 * IMPORTANT: If the database is wiped or migrated to a new cluster,
 * a new UUID will be generated, creating a new instance fingerprint.
 * The license server will see this as a new activation.
 * If your instance limit is reached due to this, contact support or use
 * the admin panel to reset instances: POST /api/admin/licenses/:id/reset-instances
 *
 * For air-gapped deployments, back up the LicenseCache table row or use
 * LICENSE_OFFLINE_MODE=true to skip activation.
 */
export async function getOrCreateInstanceUuid(): Promise<string> {
  const cached = await prisma.licenseCache.findUnique({
    where: { id: "singleton" },
    select: { instanceUuid: true },
  });
  if (cached?.instanceUuid) return cached.instanceUuid;

  const uuid = crypto.randomUUID();
  await prisma.licenseCache.upsert({
    where: { id: "singleton" },
    update: { instanceUuid: uuid },
    create: { id: "singleton", instanceUuid: uuid },
  });
  return uuid;
}

export function generateFingerprint(instanceUuid: string, licenseId: string): string {
  return crypto.createHash("sha256").update(`${instanceUuid}:${licenseId}`).digest("hex");
}
