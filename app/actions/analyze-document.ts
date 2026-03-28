"use server";

import type { AnalyzeDocumentResponse } from "@/lib/nis2-question-analysis";
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from "fs/promises";
import path from "path";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { runNis2Analysis } from "@/lib/ai/provider";
import { logErrorReport } from "@/lib/logger";
import { calculateRiskLevel } from "@/lib/risk-level";

/** Absolute directory where vendor evidence PDFs are stored off the public web root. */
const STORAGE_DIR = path.join(process.cwd(), ".avra-storage");

/**
 * Persists a PDF buffer to disk and returns the API URL that can retrieve it.
 * Directory is created on first use.
 */
async function saveEvidencePdf(
  assessmentId: string,
  originalFilename: string,
  buffer: Buffer,
): Promise<string> {
  await fs.mkdir(STORAGE_DIR, { recursive: true });
  // Sanitize the original filename — only keep safe characters
  const safeName = originalFilename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storedName = `${assessmentId}__${safeName}`;
  const filePath = path.join(STORAGE_DIR, storedName);
  await fs.writeFile(filePath, buffer);
  return `/api/documents/${encodeURIComponent(assessmentId)}?filename=${encodeURIComponent(safeName)}`;
}

const ANALYSIS_LATENCY_MS = 1_800;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_TEXT_LENGTH = 20_000;

function sanitizeExtractedText(text: string): string {
  // Strip null bytes
  let sanitized = text.replace(/\0/g, '');
  // Strip control characters except \n, \r, \t
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  // Strip zero-width spaces and similar
  sanitized = sanitized.replace(/[\u200B-\u200D\uFEFF]/g, '');
  // Truncate to max length
  sanitized = sanitized.substring(0, MAX_TEXT_LENGTH);
  // Strip excessive consecutive newlines (more than 2)
  sanitized = sanitized.replace(/\n{3,}/g, '\n\n');
  // Strip excessive consecutive spaces
  sanitized = sanitized.replace(/ {2,}/g, ' ');
  return sanitized.trim();
}

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

  // Magic Bytes Check for PDF (%PDF-)
  const signature = buffer.subarray(0, 5).toString('ascii');
  if (signature !== '%PDF-') {
    return { ok: false, error: "Security Check Failed: File is not a valid PDF document." };
  }

  // Fetch the Assessment and Company context
  const assessment = await prisma.assessment.findUnique({
    where: { vendorId },
    include: { vendor: true, company: true }
  });

  if (!assessment) {
    return { ok: false, error: "Assessment not found for the given vendor." };
  }

  const { company } = assessment;

  // --- Persist the PDF to protected storage ---
  try {
    const documentUrl = await saveEvidencePdf(assessment.id, file.name, buffer);
    await prisma.assessment.update({
      where: { id: assessment.id },
      data: { documentUrl, documentFilename: file.name },
    });
  } catch (err: unknown) {
    // Non-fatal: log but don't abort — analysis can still proceed
    logErrorReport("PDF Persistence Phase", err);
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
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(" ");
      fullText += pageText + "\n";
    }

    extractedText = fullText;
    console.log("Successfully extracted text. Length:", extractedText.length);
  } catch (err: unknown) {
    logErrorReport("PDF Extraction Phase", err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `AI Audit failed: The PDF structure could not be parsed. Details: ${errorMessage}` };
  }

  if (!extractedText) {
    return { ok: false, error: "Uploaded PDF contains no extractable text." };
  }

  // Sanitize the extracted text
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
  } catch (error: any) {
    logErrorReport("AI Evaluation Phase", error);
    return { ok: false, error: error.message || "Unknown AI error" };
  }

  // 3. Database Write
  // Create an AssessmentAnswer record for each AI result
  let compliantCount = 0;

  for (const res of results) {
    const isCompliant = res.status === "compliant";
    if (isCompliant) compliantCount++;

    const dbStatus = isCompliant ? "COMPLIANT" : "NON_COMPLIANT";

    const existing = await prisma.assessmentAnswer.findFirst({
      where: { assessmentId: assessment.id, questionId: res.questionId }
    });

    if (existing) {
      await prisma.assessmentAnswer.update({
        where: { id: existing.id },
        data: {
          status: dbStatus,
          findings: res.reasoning
        }
      });
    } else {
      await prisma.assessmentAnswer.create({
        data: {
          assessmentId: assessment.id,
          questionId: res.questionId,
          status: dbStatus,
          findings: res.reasoning,
          createdBy: "ai-analysis-system"
        }
      });
    }
  }

  // NIS2 strict rule: denominator is always the full catalogue size (totalQuestions),
  // not just the questions the AI returned — unanswered questions score 0.
  const totalQuestions = questions.length;
  const newScore = totalQuestions > 0 ? Math.round((compliantCount / totalQuestions) * 100) : 0;
  const riskLevel = calculateRiskLevel(newScore);

  await prisma.assessment.update({
    where: { id: assessment.id },
    data: { complianceScore: newScore, riskLevel }
  });

  // 4. Audit Trail
  await prisma.auditLog.create({
    data: {
      companyId: assessment.companyId,
      action: `AI-Assessment performed for ${assessment.vendor.name}`, 
      entityType: "vendor_assessment",
      entityId: assessment.id,
      actorId: "ai-system",
      createdBy: "ai-system",
      metadata: { newScore, compliantCount, total: results.length }
    }
  });

  // Ensure UI refreshes
  revalidatePath("/vendors");
  revalidatePath(`/vendors/${vendorId}/assessment`);

  return { ok: true, results };
}
