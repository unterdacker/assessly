import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";

const STORAGE_DIR = path.join(process.cwd(), ".avra-storage");

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ answerId: string }> },
) {
  const { answerId } = await params;

  const answer = await prisma.assessmentAnswer.findUnique({
    where: { id: answerId },
    select: { evidenceUrl: true },
  });

  if (!answer?.evidenceUrl) {
    return NextResponse.json({ error: "No supplemental PDF on record." }, { status: 404 });
  }

  // Extract stored filename from the URL pattern: answer__<id>__<safeName>
  const url = new URL(answer.evidenceUrl, "http://localhost");
  const safeName = url.searchParams.get("filename") ?? "evidence.pdf";
  const storedName = `answer__${answerId}__${safeName}`;
  const filePath = path.join(STORAGE_DIR, storedName);

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
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${safeName}"`,
      "Content-Length": String(buffer.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
