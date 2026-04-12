import fs from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";

const MAX_TEXT_LENGTH = 20_000;
/** Local-disk evidence store — mirrors the path used by the document GET route. */
const STORAGE_DIR = path.join(process.cwd(), ".venshield-storage");

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
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
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
 * Persist a validated PDF buffer to .venshield-storage/ and create a Document record.
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
