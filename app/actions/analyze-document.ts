"use server";

import type { AnalyzeDocumentResponse } from "@/lib/nis2-question-analysis";
import { SIMULATED_VENDOR_DOCUMENT_SNIPPET } from "@/lib/nis2-document-analysis-prompt";
import { simulateNis2DocumentAnalysis } from "@/lib/simulate-nis2-document-analysis";

const ANALYSIS_LATENCY_MS = 1_800;

/**
 * Analyzes vendor document evidence against all NIS2 catalogue questions.
 * Today: extracts no text from uploads (mock); uses a fixed policy excerpt and deterministic simulation.
 * Production: stream text from secure storage, call EU-region inference with
 * `buildNis2DocumentAnalysisSystemPrompt` / `buildNis2DocumentAnalysisUserPayload`, validate JSON.
 */
export async function analyzeDocument(
  formData: FormData,
): Promise<AnalyzeDocumentResponse> {
  const vendorId = formData.get("vendorId");
  if (typeof vendorId !== "string" || !vendorId.trim()) {
    return { ok: false, error: "Missing vendor assessment identifier." };
  }

  const file = formData.get("file");
  if (file instanceof File && file.size > 15 * 1024 * 1024) {
    return { ok: false, error: "File exceeds maximum size for this prototype." };
  }

  void vendorId;
  void file;

  await new Promise((resolve) => setTimeout(resolve, ANALYSIS_LATENCY_MS));

  const excerpt = SIMULATED_VENDOR_DOCUMENT_SNIPPET;
  const results = simulateNis2DocumentAnalysis(excerpt);

  return { ok: true, results };
}
