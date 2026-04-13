import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthSessionFromRequest } from "@/lib/auth/server";
import { logErrorReport } from "@/lib/logger";
import { getLocalFile } from "@/lib/storage";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ answerId: string }> },
) {
  const { answerId } = await params;
  const vendorToken = req.cookies.get("venshield-vendor-token")?.value || null;
  const session = await getAuthSessionFromRequest(req);

  if (vendorToken) {
    const tokenOwner = await prisma.vendor.findFirst({
      where: {
        inviteToken: vendorToken,
        inviteTokenExpires: { gt: new Date() },
      },
      include: {
        assessment: {
          select: {
            id: true,
            answers: {
              where: { id: answerId },
              select: { id: true },
            },
          },
        },
      },
    });

    if (!tokenOwner?.assessment?.answers?.length) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const answer = await prisma.assessmentAnswer.findUnique({
    where: { id: answerId },
    select: {
      evidenceFileUrl: true,
      evidenceFileName: true,
      assessment: {
        select: {
          companyId: true,
        },
      },
      document: {
        select: {
          storagePath: true,
          mimeType: true,
          filename: true,
        },
      },
    },
  });

  if (!answer?.evidenceFileUrl && !answer?.document?.storagePath) {
    return NextResponse.json({ error: "No evidence file on record." }, { status: 404 });
  }

  const internalAccess = Boolean(
    session &&
    (session.role === "ADMIN" || session.role === "AUDITOR") &&
    session.companyId === answer.assessment.companyId,
  );

  if (!vendorToken && !internalAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const downloadName = answer.document?.filename || answer.evidenceFileName || "evidence-file";

  let buffer: Buffer;
  try {
    const relPath = answer.document?.storagePath ?? `question-evidence/${answer.evidenceFileUrl}`;
    buffer = await getLocalFile(relPath);
  } catch (err) {
    logErrorReport("api.documents.read-file", err);
    return NextResponse.json({ error: "Document file not found on server." }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": answer.document?.mimeType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${downloadName}"`,
      "X-Content-Type-Options": "nosniff",
      "Content-Length": String(buffer.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
