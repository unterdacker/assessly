"use server";

import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { logAuditEvent } from "@/lib/audit-log";
import { getAuthSession } from "@/lib/auth/server";
import { assertSafeHostname } from "@/lib/oidc/ssrf-guard";
import { env } from "@/lib/env";

export type OidcSettingsState = { ok: boolean; error?: string };

export async function saveOidcSettings(
  _prevState: OidcSettingsState,
  formData: FormData,
): Promise<OidcSettingsState> {
  let session;
  try {
    session = await getAuthSession();
  } catch {
    return { ok: false, error: "FORBIDDEN" };
  }

  if (session.role !== "ADMIN" || !session.companyId) {
    return { ok: false, error: "FORBIDDEN" };
  }

  const isEnabled = formData.get("isEnabled") === "on";
  const issuerUrl = String(formData.get("issuerUrl") || "").trim();
  const clientId = String(formData.get("clientId") || "").trim();
  const clientSecret = String(formData.get("clientSecret") || "").trim();
  const jitProvisioning = formData.get("jitProvisioning") === "on";
  const jitAllowedEmailDomains = String(formData.get("jitAllowedEmailDomains") || "")
    .split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter((domain) => domain.length > 0);

  let parsedIssuer: URL;
  try {
    parsedIssuer = new URL(issuerUrl);
  } catch {
    return { ok: false, error: "INVALID_ISSUER" };
  }

  const isProduction = env.NODE_ENV === "production";
  if (isProduction && parsedIssuer.protocol !== "https:") {
    return { ok: false, error: "INVALID_ISSUER" };
  }
  if (!isProduction && parsedIssuer.protocol !== "https:" && parsedIssuer.protocol !== "http:") {
    return { ok: false, error: "INVALID_ISSUER" };
  }

  if (parsedIssuer.username !== "" || parsedIssuer.password !== "") {
    return { ok: false, error: "INVALID_ISSUER" };
  }

  try {
    await assertSafeHostname(parsedIssuer.hostname, issuerUrl);
  } catch {
    return { ok: false, error: "SSRF_BLOCKED" };
  }

  if (!clientId) {
    return { ok: false, error: "CLIENT_ID_REQUIRED" };
  }

  const encryptedSecret = clientSecret ? encrypt(clientSecret) : undefined;

  if (!encryptedSecret) {
    const existing = await prisma.oidcConfig.findUnique({
      where: { companyId: session.companyId },
      select: { id: true },
    });

    if (!existing) {
      return { ok: false, error: "CLIENT_SECRET_REQUIRED" };
    }
  }

  await prisma.oidcConfig.upsert({
    where: { companyId: session.companyId },
    create: {
      issuerUrl,
      clientId,
      clientSecretEncrypted: encryptedSecret!,
      isEnabled,
      jitProvisioning,
      jitAllowedEmailDomains,
      companyId: session.companyId,
    },
    update: {
      issuerUrl,
      clientId,
      ...(encryptedSecret ? { clientSecretEncrypted: encryptedSecret } : {}),
      isEnabled,
      jitProvisioning,
      jitAllowedEmailDomains,
    },
  });

  await logAuditEvent({
    companyId: session.companyId,
    userId: session.userId,
    action: "OIDC_CONFIG_UPDATED",
    entityType: "oidc_config",
    entityId: session.companyId,
    newValue: {
      issuerUrl,
      clientId,
      isEnabled,
      jitProvisioning,
      jitAllowedEmailDomains,
    },
  });

  return { ok: true };
}
