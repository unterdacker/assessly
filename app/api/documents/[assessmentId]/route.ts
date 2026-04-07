import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { getAuthSessionFromRequest } from "@/lib/auth/server";
import { logErrorReport } from "@/lib/logger";

const STORAGE_DIR = path.join(process.cwd(), ".assessly-storage");

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ assessmentId: string }> },
) {
  const { assessmentId } = await params;
  const session = await getAuthSessionFromRequest(req);
  const vendorToken = req.cookies.get("assessly-vendor-token")?.value || null;

  // Verify this assessment actually has a stored document
  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    select: {
      documentFilename: true,
      documentUrl: true,
      companyId: true,
      vendor: {
        select: {
          inviteToken: true,
          inviteTokenExpires: true,
        },
      },
    },
  });

  if (!assessment?.documentFilename) {
    return NextResponse.json({ error: "No document on record for this assessment." }, { status: 404 });
  }

  const internalAccess = Boolean(
    session &&
    (session.role === "ADMIN" || session.role === "AUDITOR") &&
    session.companyId === assessment.companyId,
  );
  const vendorAccess = Boolean(
    vendorToken &&
    assessment.vendor?.inviteToken === vendorToken &&
    assessment.vendor.inviteTokenExpires &&
    assessment.vendor.inviteTokenExpires > new Date(),
  );

  if (!internalAccess && !vendorAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Build the stored filename \u2014 mirrors saveEvidencePdf() in analyze-document.ts
  const safeName = assessment.documentFilename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storedName = `${assessmentId}__${safeName}`;
  const filePath = path.join(STORAGE_DIR, storedName);

  // Path-traversal guard: ensure the resolved path is inside STORAGE_DIR
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(STORAGE_DIR))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let buffer: Buffer;
  try {
    buffer = await fs.readFile(resolved);
  } catch (err) {
    logErrorReport("api.documents.read-file", err);
    return NextResponse.json({ error: "Document file not found on server." }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "X-Content-Type-Options": "nosniff",
      "Content-Length": String(buffer.byteLength),
      // Prevent caching of sensitive evidence documents
      "Cache-Control": "no-store",
    },
  });
}
