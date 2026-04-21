import "server-only";
import { prisma } from "@/lib/prisma";

export async function getCachedLicense() {
  return prisma.licenseCache.findUnique({ where: { id: "singleton" } });
}

export async function cacheLicense(
  instanceUuid: string,
  encodedLicense: string
): Promise<void> {
  await prisma.licenseCache.upsert({
    where: { id: "singleton" },
    update: { instanceUuid, encodedLicense, lastVerifiedAt: new Date(), cachedStatus: "valid", cachedMessage: null },
    create: { id: "singleton", instanceUuid, encodedLicense, lastVerifiedAt: new Date(), cachedStatus: "valid" },
  });
}

export async function updateHeartbeatStatus(status: string, message: string | null): Promise<void> {
  await prisma.licenseCache.updateMany({
    where: { id: "singleton" },
    data: { lastHeartbeatAt: new Date(), cachedStatus: status, cachedMessage: message },
  });
}
