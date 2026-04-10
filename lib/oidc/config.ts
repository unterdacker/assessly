import "server-only";
import { INTERNAL_READ_ROLES } from "@/lib/auth/permissions";
import { decrypt } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import type { OidcConfig } from "@prisma/client";

export type DecryptedOidcConfig = Omit<OidcConfig, "clientSecretEncrypted"> & {
  clientSecret: string;
};

export async function getOidcConfig(companyId: string): Promise<DecryptedOidcConfig | null> {
  const config = await prisma.oidcConfig.findUnique({ where: { companyId } });

  if (!config || !config.isEnabled) return null;

  const { clientSecretEncrypted, ...rest } = config;
  return { ...rest, clientSecret: decrypt(clientSecretEncrypted) };
}

export async function getOidcConfigForEmail(email: string): Promise<DecryptedOidcConfig | null> {
  const user = await prisma.user.findFirst({
    where: {
      email,
      role: { in: INTERNAL_READ_ROLES },
      isActive: true,
    },
    select: { companyId: true },
  });

  if (!user?.companyId) return null;

  return getOidcConfig(user.companyId);
}
