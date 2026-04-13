export const runtime = "nodejs";

import { cookies } from "next/headers";

import { INTERNAL_READ_ROLES } from "@/lib/auth/permissions";
import { AUTH_SESSION_COOKIE_NAME, hashSessionToken, verifySessionToken } from "@/lib/auth/token";
import { prisma } from "@/lib/prisma";
import {
  aggregateReportData,
  type NIS2CategoryBreakdown,
} from "@/modules/advanced-reporting/services/report-data-service";
import { generateReportPdf, type PdfInput } from "@/modules/advanced-reporting/services/pdf-generator";
import { getExecReportForPdf } from "@/lib/queries/reporting";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ reportId: string }> },
): Promise<Response> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_SESSION_COOKIE_NAME)?.value ?? null;

  if (!token) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const claims = await verifySessionToken(token).catch(() => null);
  if (!claims) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const tokenHash = await hashSessionToken(token);
  const persistedSession = await prisma.authSession.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      userId: true,
      role: true,
      companyId: true,
      vendorId: true,
      expiresAt: true,
      revokedAt: true,
      user: {
        select: {
          id: true,
          role: true,
          isActive: true,
          companyId: true,
          vendorId: true,
        },
      },
    },
  });

  if (!persistedSession || persistedSession.revokedAt || persistedSession.expiresAt <= new Date()) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!persistedSession.user.isActive) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  if (
    persistedSession.id !== claims.sid ||
    persistedSession.userId !== claims.uid ||
    persistedSession.user.role !== claims.role ||
    persistedSession.user.companyId !== claims.cid ||
    persistedSession.user.vendorId !== claims.vid
  ) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!INTERNAL_READ_ROLES.includes(persistedSession.user.role)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const { reportId } = await params;
  if (!reportId?.trim()) {
    return Response.json({ error: "invalid_report_id" }, { status: 400 });
  }

  if (!persistedSession.user.companyId) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const report = await getExecReportForPdf(reportId, persistedSession.user.companyId);

  if (!report) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  let categoryBreakdown: NIS2CategoryBreakdown[] = [];
  try {
    const aggregated = await aggregateReportData(report.assessmentId, persistedSession.user.companyId);
    categoryBreakdown = aggregated.categoryBreakdown;
  } catch {
    categoryBreakdown = [];
  }

  const pdfInput: PdfInput = {
    report: {
      id: report.id,
      status: "FINALIZED",
      executiveSummary: report.executiveSummary ?? "",
      remediationRoadmap: report.remediationRoadmap ?? "",
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
      eventHash: report.eventHash,
      creatorUserId: report.creatorUserId,
    },
    vendorName: report.assessment.vendor.name,
    vendorServiceType: report.assessment.vendor.serviceType ?? "",
    companyName: report.assessment.company.name,
    complianceScore: report.assessment.complianceScore,
    riskLevel: report.assessment.riskLevel ?? "MEDIUM",
    categoryBreakdown,
    auditLogEventHash: report.eventHash ?? "",
  };

  try {
    const pdfBuffer = await generateReportPdf(pdfInput);

    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="report-${reportId}.pdf"`,
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json({ error: "pdf_generation_failed" }, { status: 500 });
  }
}