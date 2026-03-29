/**
 * AI-assisted NIS2 question-level analysis (structured output contract).
 * Used by the document analysis server action and the assessment workspace UI.
 */

export type Nis2QuestionAnalysisStatus = "compliant" | "non-compliant";

export type Nis2QuestionAnalysis = {
  questionId: string;
  status: Nis2QuestionAnalysisStatus;
  reasoning: string;
  evidenceSnippet: string;
};

export type AnalyzeDocumentResponse =
  | { ok: true; results: Nis2QuestionAnalysis[] }
  | { ok: false; error: string };
