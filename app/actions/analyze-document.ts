"use server";

import type { AnalyzeDocumentResponse } from "@/lib/nis2-question-analysis";
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
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
import { isAccessControlError, requireAdminUser } from "@/lib/auth/server";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_TEXT_LENGTH = 20_000;
/** Local-disk evidence store — mirrors the path used by the document GET route. */
const STORAGE_DIR = path.join(process.cwd(), ".avra-storage");

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
 * Extract all text from a PDF buffer using pdfjs.
 * Exported so the re-analysis action can reuse the same logic.
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
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
  return sanitizeExtractedText(fullText);
}

/**
 * Persist a validated PDF buffer to .avra-storage/ and create a Document record.
 * Non-throwing — logs errors and returns gracefully so analysis can still proceed.
 */
export async function persistEvidencePdf(
  assessmentId: string,
  originalFilename: string,
  buffer: Buffer,
  uploadedBy: string,
): Promise<void> {
  await fs.mkdir(STORAGE_DIR, { recursive: true });
  const safeName = originalFilename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storedName = `${assessmentId}__${safeName}`;
  const filePath = path.join(STORAGE_DIR, storedName);
  // Path-traversal guard
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(STORAGE_DIR))) {
    throw new Error("Storage path validation failed — possible path traversal.");
  }
  await fs.writeFile(resolved, buffer);
  // Create Document audit record and update Assessment with the serving URL
  await prisma.document.create({
    data: {
      assessmentId,
      filename: originalFilename,
      storagePath: storedName,
      mimeType: "application/pdf",
      fileSize: buffer.byteLength,
      uploadedBy,
    },
  });
  await prisma.assessment.update({
    where: { id: assessmentId },
    data: {
      documentFilename: originalFilename,
      documentUrl: `/api/documents/${assessmentId}`,
    },
  });
}

/**
 * AI-powered document analysis action.
 * PDFs are persisted to .avra-storage/ for long-term audit traceability.
 */
export async function analyzeDocument(
  formData: FormData,
): Promise<AnalyzeDocumentResponse> {
  const session = await requireAdminUser().catch((error) => {
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
    where: { vendorId, companyId: session.companyId ?? undefined },
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
      aiSuggestedStatus: aiCalculatedStatus,
      aiReasoning: res.reasoning,
      justificationText: res.reasoning,
      aiConfidence: 0.95,
      findings: res.reasoning,
      evidenceSnippet: res.evidenceSnippet,
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
        dataSent: aiWriteFields,
      });
      
      try {
        const fallbackData = {
          status: "PENDING",
          findings: res.reasoning,
          evidenceSnippet: res.evidenceSnippet,
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
  const { score: newScore } = await syncAssessmentComplianceToDatabase(
    assessment.id,
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
