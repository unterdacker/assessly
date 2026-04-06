/**
 * AI-assisted NIS2 question-level analysis (structured output contract).
 * Used by the document analysis server action and the assessment workspace UI.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Zod schemas — single source of truth for shape and runtime validation
// ---------------------------------------------------------------------------

export const Nis2QuestionAnalysisStatusSchema = z.enum(["compliant", "non-compliant"]);
export type Nis2QuestionAnalysisStatus = z.infer<typeof Nis2QuestionAnalysisStatusSchema>;

export const Nis2QuestionAnalysisSchema = z.object({
  questionId:      z.string().max(100),     // UUIDs are 36 chars; 100 is generous
  status:          Nis2QuestionAnalysisStatusSchema,
  reasoning:       z.string().max(10_000),  // prevents oversized DB payloads
  evidenceSnippet: z.string().max(5_000),   // prevents oversized DB payloads
});
export type Nis2QuestionAnalysis = z.infer<typeof Nis2QuestionAnalysisSchema>;

export const AnalyzeDocumentResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true),  results: z.array(Nis2QuestionAnalysisSchema) }),
  z.object({ ok: z.literal(false), error:   z.string() }),
]);
export type AnalyzeDocumentResponse = z.infer<typeof AnalyzeDocumentResponseSchema>;

// ---------------------------------------------------------------------------
// Custom error — carries Zod structural metadata without raw model content
// ---------------------------------------------------------------------------

export class Nis2AnalysisParseError extends Error {
  readonly zodIssueCount: number;
  readonly zodPaths: string[];

  constructor(zodError: z.ZodError) {
    super("invalid_response");
    this.name = "Nis2AnalysisParseError";
    this.zodIssueCount = zodError.issues.length;
    // paths are schema-defined key names, not model content — safe to log
    this.zodPaths = zodError.issues.map(i => i.path.join("."));
  }
}

// ---------------------------------------------------------------------------
// Parse function — validates LLM output atomically (no partial acceptance)
// ---------------------------------------------------------------------------

/**
 * Validates and extracts the Nis2QuestionAnalysis array from raw LLM output.
 * Handles two response shapes: a bare array, or an object wrapping an array
 * at key "results". Uses Zod .parse() for atomic validation — if any single
 * item fails, the entire response is rejected.
 * Throws Nis2AnalysisParseError on failure (structural metadata only, no
 * raw model content).
 */
export function parseNis2AnalysisResults(data: unknown): Nis2QuestionAnalysis[] {
  // Try bare array first (most common LLM response shape)
  try {
    return z.array(Nis2QuestionAnalysisSchema).parse(data);
  } catch (arrayError: unknown) {
    // Try wrapped at "results" key (second common shape)
    try {
      const wrapped = z.object({ results: z.array(Nis2QuestionAnalysisSchema) }).parse(data);
      return wrapped.results;
    } catch {
      // Use the bare-array error for best diagnostics (most likely intended shape)
      throw new Nis2AnalysisParseError(
        arrayError instanceof z.ZodError ? arrayError : new z.ZodError([]),
      );
    }
  }
}
