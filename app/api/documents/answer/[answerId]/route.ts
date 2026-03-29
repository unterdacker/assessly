import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";

const STORAGE_DIR = path.join(process.cwd(), ".avra-storage", "question-evidence");

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ answerId: string }> },
) {
  const { answerId } = await params;

  const answer = await prisma.assessmentAnswer.findUnique({
    where: { id: answerId },
    select: { evidenceFileUrl: true, evidenceFileName: true },
  });

  if (!answer?.evidenceFileUrl) {
    return NextResponse.json({ error: "No evidence file on record." }, { status: 404 });
  }

  const filePath = path.join(STORAGE_DIR, answer.evidenceFileUrl);
  const downloadName = answer.evidenceFileName || "evidence-file";

  // Path-traversal guard
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(STORAGE_DIR))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let buffer: Buffer;
  try {
    buffer = await fs.readFile(resolved);
  } catch {
    return NextResponse.json({ error: "File not found on server." }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${downloadName}"`,
      "X-Content-Type-Options": "nosniff",
      "Content-Length": String(buffer.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
