// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Assessly Contributors
// See LICENSE for full license text
"use server";

import type { AnalyzeDocumentResponse } from "@/lib/nis2-question-analysis";
import type { Prisma } from "@prisma/client";
import fs from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { runNis2AnalysisWithTrace } from "@/lib/ai/provider";
import { logErrorReport } from "@/lib/logger";
import { logAuditEvent } from "@/lib/audit-log";
import {
  countStrictlyCompliantAnswers,
  syncAssessmentComplianceToDatabase,
} from "@/lib/assessment-compliance";
import { extractPdfText } from "@/lib/pdf-utils";
import { isAccessControlError, requireAuthSession } from "@/lib/auth/server";

const STORAGE_DIR = path.join(process.cwd(), ".assessly-storage");

/**
 * Re-run AI analysis on a previously stored PDF evidence document.
 * Allows auditors to refresh AI suggestions without re-uploading the file —
 * critical for NIS2 long-term traceability and periodic re-assessment.
 */
export async function reanalyzeStoredDocument(
  assessmentId: string,
): Promise<AnalyzeDocumentResponse> {
  const session = await requireAuthSession().catch((error) => {
    if (isAccessControlError(error)) {
      return null;
    }
    throw error;
  });

  if (!session) {
    return { ok: false, error: "Unauthorized." };
  }

  if (session.role !== "ADMIN" && session.role !== "VENDOR") {
    return { ok: false, error: "Unauthorized." };
  }

  if (!assessmentId?.trim()) {
    return { ok: false, error: "Missing assessment identifier." };
  }

  const assessment = await prisma.assessment.findFirst({
    where: {
      id: assessmentId,
      ...(session.role === "ADMIN" ? { companyId: session.companyId ?? undefined } : {}),
      ...(session.role === "VENDOR" ? { vendorId: session.vendorId ?? undefined } : {}),
    },
    include: { vendor: true, company: true },
  });

  if (!assessment) {
    return { ok: false, error: "Assessment not found." };
  }

  if (!assessment.documentFilename) {
    return {
      ok: false,
      error: "No stored document found for this assessment. Please upload a PDF first.",
    };
  }

  // Build the storage path — must mirror persistEvidencePdf() naming convention
  const safeName = assessment.documentFilename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storedName = `${assessmentId}__${safeName}`;
  const filePath = path.join(STORAGE_DIR, storedName);

  // Path-traversal guard
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(STORAGE_DIR))) {
    return { ok: false, error: "Forbidden." };
  }

  let buffer: Buffer;
  try {
    buffer = await fs.readFile(resolved) as Buffer;
  } catch {
    return {
      ok: false,
      error:
        "Stored document file not found on server. The file may have been removed. Please re-upload.",
    };
  }

  const questions = await prisma.question.findMany({ orderBy: { sortOrder: "asc" } });

  let extractedText: string;
  try {
    extractedText = await extractPdfText(buffer);
  } catch (err: unknown) {
    logErrorReport("PDF Re-Analysis Text Extraction", err);
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Could not parse the stored PDF: ${message}` };
  }

  if (!extractedText) {
    return { ok: false, error: "Stored PDF contains no extractable text." };
  }

  const questionPayload = questions.map((q) => ({
    id: q.id,
    category: q.category,
    text: q.text,
    guidance: q.guidance ?? undefined,
  }));

  let analysis;
  try {
    analysis = await runNis2AnalysisWithTrace(assessment.companyId, questionPayload, extractedText);
  } catch (error: unknown) {
    logErrorReport("AI Re-Analysis Phase", error);
    const message = error instanceof Error ? error.message : "Unknown AI error";
    return { ok: false, error: message };
  }

  const { results, trace } = analysis;

  // Write AI results to DB — same logic as the initial analysis
  for (const res of results) {
    const aiCalculatedStatus = res.status === "compliant" ? "COMPLIANT" : "NON_COMPLIANT";
    const existing = await prisma.assessmentAnswer.findFirst({
      where: { assessmentId, questionId: res.questionId },
    });
    const data: Record<string, unknown> = {
      status: aiCalculatedStatus,
      isAiSuggested: true,
      verified: false,
      aiSuggestedStatus: aiCalculatedStatus,
      aiReasoning: res.reasoning,
      justificationText: res.reasoning,
      aiConfidence: 0.95,
      findings: res.reasoning,
      evidenceSnippet: res.evidenceSnippet,
      createdBy: "ai-reanalysis-system",
    };
    try {
      if (existing) {
        await prisma.assessmentAnswer.update({ where: { id: existing.id }, data: data as unknown as Prisma.AssessmentAnswerUpdateInput });
      } else {
        await prisma.assessmentAnswer.create({
          data: { assessmentId, questionId: res.questionId, ...data } as unknown as Prisma.AssessmentAnswerUncheckedCreateInput,
        });
      }
    } catch (err: unknown) {
      console.error(`[reanalyzeStoredDocument] Failed writing answer for ${res.questionId}:`, err);
    }
  }

  const persistedAnswers = await prisma.assessmentAnswer.findMany({
    where: { assessmentId },
    select: { status: true },
  });
  const totalQuestions = questions.length;
  const { score: newScore } = await syncAssessmentComplianceToDatabase(
    assessmentId,
    persistedAnswers,
    totalQuestions,
    assessment.complianceScore,
    assessment.riskLevel,
  );
  const compliantCount = countStrictlyCompliantAnswers(persistedAnswers);

  try {
    await logAuditEvent(
      {
        companyId: assessment.companyId,
        userId: "ai-system",
        action: "AI_GENERATION",
        entityType: "vendor_assessment",
        entityId: assessmentId,
        previousValue: null,
        newValue: {
          source: "questionnaire_prefill_reanalysis",
          vendorId: assessment.vendorId,
          documentFilename: assessment.documentFilename,
          prompt_snapshot: trace.promptSnapshot,
          model_info: trace.modelInfo,
          raw_ai_output: trace.rawAiOutput,
          newScore,
          compliantCount,
          totalQuestions,
        },
      },
      { captureHeaders: false },
    );
  } catch (auditErr) {
    logErrorReport("AI Reanalysis Audit Log Creation Failed", auditErr);
  }

  revalidatePath("/vendors");
  revalidatePath(`/vendors/${assessment.vendorId}/assessment`);

  return { ok: true, results };
}
