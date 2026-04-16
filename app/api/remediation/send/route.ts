import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/lib/audit-log";
import { getAuthSessionFromRequest } from "@/lib/auth/server";

type SendRemediationBody = {
  vendorId?: string;
  recipientEmail?: string;
  finalDraft?: string;
  originalAiOutput?: string;
  aiGenerationEventId?: string | null;
};

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSessionFromRequest(request);
    if (!session || session.role !== "ADMIN") {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 403 });
    }

    const body = (await request.json()) as SendRemediationBody;
    const vendorId = body.vendorId?.trim();
    const recipientEmail = body.recipientEmail?.trim();
    const finalDraft = body.finalDraft?.trim();
    const originalAiOutput = body.originalAiOutput?.trim() || "";
    const aiGenerationEventId = body.aiGenerationEventId?.trim() || null;

    if (!vendorId) {
      return NextResponse.json({ ok: false, error: "vendorId is required." }, { status: 400 });
    }

    if (!recipientEmail) {
      return NextResponse.json({ ok: false, error: "recipientEmail is required." }, { status: 400 });
    }

    if (!finalDraft) {
      return NextResponse.json({ ok: false, error: "finalDraft is required." }, { status: 400 });
    }

    const assessment = await prisma.assessment.findUnique({
      where: { vendorId },
      select: {
        id: true,
        companyId: true,
        vendor: {
          select: {
            name: true,
            securityOfficerEmail: true,
          },
        },
      },
    });

    if (!assessment) {
      return NextResponse.json({ ok: false, error: "Vendor assessment not found." }, { status: 404 });
    }

    if (assessment.companyId !== session.companyId) {
      return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });
    }

    const securityContactEmail = assessment.vendor.securityOfficerEmail?.trim() || null;
    const effectiveRecipientEmail = securityContactEmail || recipientEmail;
    const wasEditedByHuman = originalAiOutput.trim() !== finalDraft;

    const sendAudit = await logAuditEvent(
      {
        companyId: assessment.companyId,
        userId: session.userId,
        action: "AI_REMEDIATION_SENT",
        entityType: "remediation_email",
        entityId: assessment.id,
        hitlVerifiedBy: session.userId,
        previousValue: {
          raw_ai_output: originalAiOutput,
        },
        newValue: {
          final_draft: finalDraft,
          was_edited_by_human: wasEditedByHuman,
          ai_generation_event_id: aiGenerationEventId,
          recipient_email: effectiveRecipientEmail,
          security_contact_email: securityContactEmail,
          recipient_matches_security_contact: Boolean(securityContactEmail),
        },
      },
      { captureHeaders: false },
    );

    return NextResponse.json({
      ok: true,
      wasEditedByHuman,
      vendorName: assessment.vendor.name,
      recipientEmail: effectiveRecipientEmail,
      sendAuditEventId: sendAudit?.id ?? null,
      aiGenerationEventId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
