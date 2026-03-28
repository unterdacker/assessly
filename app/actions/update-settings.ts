"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function updateAiSettings(prevState: any, formData: FormData) {
  const companyId = formData.get("companyId") as string;
  const aiProvider = formData.get("aiProvider") as string;
  const mistralApiKey = formData.get("mistralApiKey") as string | null;
  const localAiEndpoint = formData.get("localAiEndpoint") as string | null;

  if (!companyId) {
    return { success: false, error: "Company ID is required." };
  }

  if (!aiProvider || !["mistral", "local"].includes(aiProvider)) {
    return { ok: false, error: "Invalid AI provider selected." };
  }

  if (aiProvider === "mistral" && !mistralApiKey?.trim()) {
    return { ok: false, error: "Mistral API Key is required when using Mistral provider." };
  }

  if (aiProvider === "local" && !localAiEndpoint?.trim()) {
    return { ok: false, error: "Local AI Endpoint is required when using Local provider." };
  }

  try {
    await prisma.company.update({
      where: { id: companyId },
      data: {
        aiProvider,
        mistralApiKey: aiProvider === "mistral" ? mistralApiKey : null,
        localAiEndpoint: aiProvider === "local" ? localAiEndpoint : null,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        companyId,
        action: `AI Provider switched to ${aiProvider === "mistral" ? "Mistral AI" : "Local Server"}`,
        entityType: "company_settings",
        entityId: companyId,
        actorId: "user", // TODO: From auth
        createdBy: "user",
      },
    });

    revalidatePath('/settings');
    return { success: true };
  } catch (error) {
    console.error("Settings Update Error:", error);
    return { success: false, error: "Failed to update settings. Please try again." };
  }
}