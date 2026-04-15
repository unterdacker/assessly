"use server";

import type { AnalyzeDocumentResponse } from "@/lib/nis2-question-analysis";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { runNis2AnalysisWithTrace } from "@/lib/ai/provider";
import { logErrorReport } from "@/lib/logger";
import { logAuditEvent } from "@/lib/audit-log";
import { encrypt } from "@/lib/crypto";
import {
  countStrictlyCompliantAnswers,
  syncAssessmentComplianceToDatabase,
} from "@/lib/assessment-compliance";
import { isAccessControlError, requireAuthSession } from "@/lib/auth/server";
import { extractPdfText, persistEvidencePdf } from "@/lib/pdf-utils";
import { fireWebhookEvent } from "@/modules/webhooks/lib/fire-webhook-event";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * AI-powered document analysis action.
 * PDFs are persisted to .venshield-storage/ for long-term audit traceability.
 */
export async function analyzeDocument(
  formData: FormData,
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

  const vendorId = formData.get("vendorId");
  if (typeof vendorId !== "string" || !vendorId.trim()) {
    return { ok: false, error: "Missing vendor assessment identifier." };
  }

  if (session.role !== "ADMIN" && session.role !== "VENDOR") {
    return { ok: false, error: "Unauthorized." };
  }

  if (session.role === "VENDOR" && session.vendorId !== vendorId) {
    return { ok: false, error: "Unauthorized." };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "Please upload a PDF file for analysis." };
  }

  if (file.size > MAX_FILE_SIZE) {
    return { ok: false, error: "File exceeds maximum allowed size." };
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  const signature = buffer.subarray(0, 5).toString('ascii');
  if (signature !== '%PDF-') {
    return { ok: false, error: "Security Check Failed: File is not a valid PDF document." };
  }

  const assessment = await prisma.assessment.findFirst({
    where: {
      vendorId,
      ...(session.role === "ADMIN" ? { companyId: session.companyId ?? undefined } : {}),
    },
    include: { vendor: true, company: true }
  });

  if (!assessment) {
    return { ok: false, error: "Assessment not found for the given vendor." };
  }

  // 1. Persist the PDF to disk and record the Document entry
  try {
    await persistEvidencePdf(assessment.id, file.name, buffer, session.userId);
  } catch (storageErr) {
    logErrorReport("PDF Storage Phase", storageErr);
    // Non-fatal: continue with AI analysis even if disk write fails
  }

  // No AI Mode: evidence upload stays functional, but AI analysis is skipped.
  if (assessment.company.aiDisabled) {
    revalidatePath("/vendors");
    revalidatePath(`/vendors/${vendorId}/assessment`);
    return {
      ok: true,
      results: [],
      aiSkipped: true,
      message: "Document uploaded. AI analysis is disabled.",
    };
  }

  // 2. Fetch the NIS2 questions from the DB
  const questions = await prisma.question.findMany({
    orderBy: { sortOrder: 'asc' }
  });

  // 3. Extract text from PDF
  let extractedText = "";
  try {
    extractedText = await extractPdfText(buffer);
  } catch (err: unknown) {
    logErrorReport("PDF Extraction Phase", err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `AI Audit failed: The PDF structure could not be parsed. Details: ${errorMessage}` };
  }
  if (!extractedText) {
    return { ok: false, error: "Uploaded PDF contains no extractable text." };
  }

  // Prompt-stuffing guard: cap document input to prevent context-window abuse
  // and injection via oversized documents. 40 000 chars ≈ ~10 000 tokens,
  // well within the NIS2 analysis prompt budget while removing the attack surface.
  const MAX_DOCUMENT_CHARS = 40_000;
  if (extractedText.length > MAX_DOCUMENT_CHARS) {
    extractedText = extractedText.slice(0, MAX_DOCUMENT_CHARS);
  }

  // 4. Call the LLM
  const questionPayload = questions.map(q => ({
    id: q.id,
    category: q.category,
    text: q.text,
    guidance: q.guidance ?? undefined
  }));

  let analysis;
  try {
    analysis = await runNis2AnalysisWithTrace(assessment.companyId, questionPayload, extractedText);
  } catch (error: unknown) {
    logErrorReport("AI Evaluation Phase", error);
    const message = error instanceof Error ? error.message : "Unknown AI error";
    return { ok: false, error: message };
  }

  const { results, trace } = analysis;

  // 3. Database Write — AI pre-fills suggestions but leaves status PENDING for vendor review.
  for (const res of results) {
    const aiCalculatedStatus = res.status === "compliant" ? "COMPLIANT" : "NON_COMPLIANT";

    const existing = await prisma.assessmentAnswer.findFirst({
      where: { assessmentId: assessment.id, questionId: res.questionId }
    });

    const aiWriteFields = {
      status: aiCalculatedStatus,
      isAiSuggested: true,
      verified: false,
      aiSuggestedStatus: encrypt(aiCalculatedStatus),
      aiReasoning: encrypt(res.reasoning),
      justificationText: encrypt(res.reasoning),
      aiConfidence: 0.95,
      findings: encrypt(res.reasoning),
      evidenceSnippet: res.evidenceSnippet ? encrypt(res.evidenceSnippet) : null,
      createdBy: "ai-analysis-system",
    };

    try {
      if (existing) {
        await prisma.assessmentAnswer.update({
          where: { id: existing.id },
          data: aiWriteFields,
        });
      } else {
        await prisma.assessmentAnswer.create({
          data: {
            assessmentId: assessment.id,
            questionId: res.questionId,
            ...aiWriteFields,
          },
        });
      }
    } catch (error: unknown) {
      const prismaErr = error as { message?: string; code?: string };
      console.error(`[Prisma Error] Failed updating question ${res.questionId}:`, {
        message: prismaErr.message,
        code: prismaErr.code,
        dataSent: {
          questionId:      res.questionId,
          statusAttempted: aiCalculatedStatus,
          fieldsWritten:   Object.keys(aiWriteFields),  // field names only, no content
        },
      });
      
      try {
        const fallbackData = {
          status: "PENDING",
          findings: encrypt(res.reasoning),
          evidenceSnippet: res.evidenceSnippet ? encrypt(res.evidenceSnippet) : null,
        };
        if (existing) {
          await prisma.assessmentAnswer.update({
            where: { id: existing.id },
            data: fallbackData,
          });
        }
      } catch (fallbackError) {
        console.error("Critical Fallback Failure:", fallbackError);
      }
    }
  }

  const persistedAnswers = await prisma.assessmentAnswer.findMany({
    where: { assessmentId: assessment.id },
    select: { status: true },
  });
  const totalQuestions = questions.length;
  const { score: newScore, riskLevel: newRiskLevel } = await syncAssessmentComplianceToDatabase(
    assessment.id,
    persistedAnswers,
    totalQuestions,
    assessment.complianceScore,
    assessment.riskLevel,
  );
  if (newRiskLevel !== assessment.riskLevel) {
    void fireWebhookEvent(assessment.companyId, {
      event: "vendor.risk_changed" as const,
      assessmentId: assessment.id,
      vendorId: assessment.vendorId,
      companyId: assessment.companyId,
      previousRiskLevel: assessment.riskLevel,
      newRiskLevel,
      changedAt: new Date().toISOString(),
    });
  }
  const compliantCount = countStrictlyCompliantAnswers(persistedAnswers);

  try {
    await logAuditEvent(
      {
        companyId: assessment.companyId,
        userId: "ai-system",
        action: "AI_GENERATION",
        entityType: "vendor_assessment",
        entityId: assessment.id,
        previousValue: null,
        newValue: {
          source: "questionnaire_prefill",
          vendorId,
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
    logErrorReport("AI Prefill Audit Log Creation Failed", auditErr);
  }

  revalidatePath("/vendors");
  revalidatePath(`/vendors/${vendorId}/assessment`);

  return { ok: true, results };
}
