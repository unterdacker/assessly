"use server";

import type { AnalyzeDocumentResponse } from "@/lib/nis2-question-analysis";
import { SIMULATED_VENDOR_DOCUMENT_SNIPPET } from "@/lib/nis2-document-analysis-prompt";
import { simulateNis2DocumentAnalysis } from "@/lib/simulate-nis2-document-analysis";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { runNis2Analysis } from "@/lib/ai-client";

const ANALYSIS_LATENCY_MS = 1_800;

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

  // Fetch the Assessment and Company context
  const assessment = await prisma.assessment.findUnique({
    where: { vendorId },
    include: { vendor: true, company: true }
  });

  if (!assessment) {
    return { ok: false, error: "Assessment not found for the given vendor." };
  }

  const { company } = assessment;

  // 1. Fetch the 20 NIS2 questions from the DB
  const questions = await prisma.question.findMany({
    orderBy: { sortOrder: 'asc' }
  });

  const excerpt = SIMULATED_VENDOR_DOCUMENT_SNIPPET;

  // 2. Call an LLM (Abstracted Provider Logic)
  const questionPayload = questions.map(q => ({
    id: q.id,
    category: q.category,
    text: q.text,
    guidance: q.guidance ?? undefined
  }));

  let results;
  try {
    results = await runNis2Analysis(assessment.companyId, questionPayload, excerpt);
  } catch (error: any) {
    return { ok: false, error: error.message };
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

  // Update the complianceScore of the Assessment
  const newScore = Math.round((compliantCount / results.length) * 100);
  
  await prisma.assessment.update({
    where: { id: assessment.id },
    data: { complianceScore: newScore }
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
