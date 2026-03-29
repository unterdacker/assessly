"use server";

import type { AnalyzeDocumentResponse } from "@/lib/nis2-question-analysis";
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { runNis2Analysis } from "@/lib/ai/provider";
import { logErrorReport } from "@/lib/logger";
import {
  countStrictlyCompliantAnswers,
  syncAssessmentComplianceToDatabase,
} from "@/lib/assessment-compliance";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_TEXT_LENGTH = 20_000;

function textItemToString(item: unknown): string {
  if (
    typeof item === "object" &&
    item !== null &&
    "str" in item &&
    typeof (item as { str: unknown }).str === "string"
  ) {
    return (item as { str: string }).str;
  }
  return "";
}

function sanitizeExtractedText(text: string): string {
  let sanitized = text.replace(/\0/g, '');
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  sanitized = sanitized.replace(/[\u200B-\u200D\uFEFF]/g, '');
  sanitized = sanitized.substring(0, MAX_TEXT_LENGTH);
  sanitized = sanitized.replace(/\n{3,}/g, '\n\n');
  sanitized = sanitized.replace(/ {2,}/g, ' ');
  return sanitized.trim();
}

/**
 * AI-powered document analysis action.
 * Processed STATELESSLY: No PDF files are stored permanently for privacy compliance.
 */
export async function analyzeDocument(
  formData: FormData,
): Promise<AnalyzeDocumentResponse> {
  const vendorId = formData.get("vendorId");
  if (typeof vendorId !== "string" || !vendorId.trim()) {
    return { ok: false, error: "Missing vendor assessment identifier." };
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

  const assessment = await prisma.assessment.findUnique({
    where: { vendorId },
    include: { vendor: true, company: true }
  });

  if (!assessment) {
    return { ok: false, error: "Assessment not found for the given vendor." };
  }

  // 1. Fetch the 20 NIS2 questions from the DB
  const questions = await prisma.question.findMany({
    orderBy: { sortOrder: 'asc' }
  });

  let extractedText = "";
  try {
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      useWorkerFetch: false,
      stopAtErrors: true,
    });

    const pdfDocument = await loadingTask.promise;
    let fullText = "";

    for (let i = 1; i <= pdfDocument.numPages; i++) {
      const page = await pdfDocument.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(textItemToString).join(" ");
      fullText += pageText + "\n";
    }

    extractedText = fullText;
  } catch (err: unknown) {
    logErrorReport("PDF Extraction Phase", err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `AI Audit failed: The PDF structure could not be parsed. Details: ${errorMessage}` };
  }

  if (!extractedText) {
    return { ok: false, error: "Uploaded PDF contains no extractable text." };
  }

  extractedText = sanitizeExtractedText(extractedText);

  // 2. Call an LLM (Abstracted Provider Logic)
  const questionPayload = questions.map(q => ({
    id: q.id,
    category: q.category,
    text: q.text,
    guidance: q.guidance ?? undefined
  }));

  let results;
  try {
    results = await runNis2Analysis(assessment.companyId, questionPayload, extractedText);
  } catch (error: unknown) {
    logErrorReport("AI Evaluation Phase", error);
    const message = error instanceof Error ? error.message : "Unknown AI error";
    return { ok: false, error: message };
  }

  // 3. Database Write — AI pre-fills suggestions but leaves status PENDING for vendor review.
  for (const res of results) {
    const aiCalculatedStatus = res.status === "compliant" ? "COMPLIANT" : "NON_COMPLIANT";

    const existing = await prisma.assessmentAnswer.findFirst({
      where: { assessmentId: assessment.id, questionId: res.questionId }
    });

    const data: any = {
      status: aiCalculatedStatus, 
      isAiSuggested: true,
      verified: false,
      aiSuggestedStatus: aiCalculatedStatus,
      aiReasoning: res.reasoning,
      aiConfidence: 0.95,
      findings: res.reasoning,
      evidenceSnippet: res.evidenceSnippet,
      createdBy: "ai-analysis-system"
    };

    try {
      if (existing) {
        const { id, ...updateData } = data;
        await prisma.assessmentAnswer.update({
          where: { id: existing.id },
          data: updateData
        });
      } else {
        await prisma.assessmentAnswer.create({
          data: {
            assessmentId: assessment.id,
            questionId: res.questionId,
            ...data
          }
        });
      }
    } catch (error: any) {
      console.error(`[Prisma Error] Failed updating question ${res.questionId}:`, {
        message: error.message,
        code: error.code,
        dataSent: data
      });
      
      try {
        const fallbackData = { 
          status: "PENDING", 
          findings: res.reasoning,
          evidenceSnippet: res.evidenceSnippet 
        };
        if (existing) {
          await prisma.assessmentAnswer.update({
            where: { id: existing.id },
            data: fallbackData
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
  const { score: newScore } = await syncAssessmentComplianceToDatabase(
    assessment.id,
    persistedAnswers,
    totalQuestions,
    assessment.complianceScore,
    assessment.riskLevel,
  );
  const compliantCount = countStrictlyCompliantAnswers(persistedAnswers);

  await prisma.auditLog.create({
    data: {
      companyId: assessment.companyId,
      action: `AI-Assessment performed for ${assessment.vendor.name} (Stateless)`, 
      entityType: "vendor_assessment",
      entityId: assessment.id,
      actorId: "ai-system",
      createdBy: "ai-system",
      metadata: { newScore, compliantCount, totalQuestions, mode: "stateless" },
    }
  });

  revalidatePath("/vendors");
  revalidatePath(`/vendors/${vendorId}/assessment`);

  return { ok: true, results };
}
