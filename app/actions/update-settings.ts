"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { encrypt } from "@/lib/crypto";
import { isAccessControlError, requireAdminUser } from "@/lib/auth/server";

// ---------------------------------------------------------------------------
// SSRF block-list: deny well-known cloud metadata and link-local endpoints.
// This is a defence-in-depth measure — the admin is trusted, but we prevent
// accidental or supply-chain-injected SSRF vectors.
// ---------------------------------------------------------------------------
const SSRF_BLOCKLIST = new Set([
  "169.254.169.254",       // AWS / Azure / GCP instance metadata
  "169.254.170.2",         // AWS ECS credentials
  "fd00:ec2::254",         // AWS IPv6 metadata
  "metadata.google.internal",
  "metadata.goog",
]);

function validateLocalAiEndpoint(raw: string): { ok: true; url: URL } | { ok: false; error: string } {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return { ok: false, error: "Local AI endpoint must be a valid URL (e.g. http://localhost:11434)." };
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return { ok: false, error: "Local AI endpoint must use the http or https scheme." };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (SSRF_BLOCKLIST.has(hostname)) {
    return { ok: false, error: "That Local AI endpoint address is not permitted." };
  }

  return { ok: true, url: parsed };
}

export async function updateAiSettings(
  _prevState: unknown,
  formData: FormData,
) {
  const session = await requireAdminUser();
  const companyId = formData.get("companyId") as string;
  const aiProvider = formData.get("aiProvider") as string;
  const mistralApiKey = formData.get("mistralApiKey") as string | null;
  const localAiEndpoint = formData.get("localAiEndpoint") as string | null;
  const localAiModel = formData.get("localAiModel") as string | null;

  if (!companyId) {
    return { success: false, error: "Company ID is required." };
  }

  if (!session.companyId || companyId !== session.companyId) {
    return { success: false, error: "Unauthorized." };
  }

  if (!aiProvider || !["mistral", "local"].includes(aiProvider)) {
    return { ok: false, error: "Invalid AI provider selected." };
  }

  if (aiProvider === "mistral" && !mistralApiKey?.trim()) {
    // Allow empty submission so the form can be saved without re-providing an
    // already-stored key. The existing encrypted value will be preserved below.
  }

  if (aiProvider === "local" && !localAiEndpoint?.trim()) {
    return { ok: false, error: "Local AI Endpoint is required when using Local provider." };
  }

  // F-21: validate localAiEndpoint to prevent SSRF attacks
  if (aiProvider === "local" && localAiEndpoint?.trim()) {
    const validation = validateLocalAiEndpoint(localAiEndpoint);
    if (!validation.ok) {
      return { ok: false, error: validation.error };
    }
  }

  // F-20: encrypt the Mistral API key before persisting so a DB dump does not
  // expose the credential in plaintext. The key is decrypted at call-time only.
  // If the submitted key is blank, preserve the existing encrypted value in the DB.
  let encryptedMistralApiKey: string | null | undefined = undefined; // undefined = no change
  if (aiProvider === "mistral") {
    if (mistralApiKey?.trim()) {
      try {
        encryptedMistralApiKey = encrypt(mistralApiKey.trim());
      } catch {
        return { ok: false, error: "Failed to encrypt the Mistral API key. Check SETTINGS_ENCRYPTION_KEY." };
      }
    }
    // else: user left the field blank — keep the existing stored key (undefined means Prisma skips the field)
  }

  try {
    await prisma.company.update({
      where: { id: companyId },
      data: {
        aiProvider,
        ...(aiProvider === "mistral"
          ? encryptedMistralApiKey !== undefined
            ? { mistralApiKey: encryptedMistralApiKey }
            : {}
          : { mistralApiKey: null }),
        localAiEndpoint: aiProvider === "local" ? localAiEndpoint : null,
        localAiModel: aiProvider === "local" ? (localAiModel?.trim() || null) : null,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        companyId,
        action: `AI Provider switched to ${aiProvider === "mistral" ? "Mistral AI" : "Local Server"}`,
        entityType: "company_settings",
        entityId: companyId,
        actorId: session.userId,
        createdBy: session.userId,
      },
    });

    revalidatePath('/settings');
    return { success: true };
  } catch (error) {
    if (isAccessControlError(error)) {
      return { success: false, error: "Unauthorized." };
    }
    console.error("Settings Update Error:", error);
    return { success: false, error: "Failed to update settings. Please try again." };
  }
}