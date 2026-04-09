import "server-only";

import type { OidcConfig } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { INTERNAL_READ_ROLES } from "@/lib/auth/permissions";

export type DecryptedOidcConfig = Omit<OidcConfig, "clientSecretEncrypted"> & {
  clientSecret: string;
};

export async function getOidcConfig(
  companyId: string,
): Promise<DecryptedOidcConfig | null> {
  const config = await prisma.oidcConfig.findUnique({ where: { companyId } });
  if (!config || !config.isEnabled) {
    return null;
  }

  const clientSecret = decrypt(config.clientSecretEncrypted);
  const { clientSecretEncrypted, ...rest } = config;
  void clientSecretEncrypted;

  return {
    ...rest,
    clientSecret,
  };
}

export async function getOidcConfigForEmail(
  email: string,
): Promise<(DecryptedOidcConfig & { companyId: string }) | null> {
  const user = await prisma.user.findFirst({
    where: {
      email,
      role: { in: INTERNAL_READ_ROLES },
      isActive: true,
    },
    select: { companyId: true },
  });

  if (!user?.companyId) {
    return null;
  }

  const config = await getOidcConfig(user.companyId);
  if (!config) {
    return null;
  }

  return {
    ...config,
    companyId: user.companyId,
  };
}
