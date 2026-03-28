import type { Nis2Question } from "@/lib/nis2-questions";

/**
 * Simulated vendor document: Information Security Policy excerpt.
 * Replace with extracted text from uploaded files in production.
 */
export const SIMULATED_VENDOR_DOCUMENT_SNIPPET = `
Information Security Policy (excerpt) — ACME Cloud Services Ltd — Effective 2026-01-15

1. Governance
This Information Security Policy is approved by the Board of Directors and reviewed at least annually.
The Chief Information Security Officer (CISO) is accountable for cybersecurity and reports to the CTO.

2. Risk management
Enterprise cybersecurity risks are assessed annually and whenever major systems or vendors change materially.

3. Access and authentication
Multi-factor authentication is mandatory for all administrative access to production environments and customer data stores.

4. Cryptography
Customer and production data is encrypted in transit using TLS 1.2 or higher and at rest using AES-256.

5. Operations
Security-relevant logs are collected centrally and retained for twelve months. Critical security patches are applied within fourteen days of vendor release where technically feasible.

6. Incidents and continuity
An Incident Response Plan is maintained with defined customer notification timelines for significant security events.
Business continuity and disaster recovery exercises are conducted yearly; the most recent test achieved a recovery point objective under four hours.

7. Supply chain and testing
Dependency and third-party component scanning is integrated into the CI/CD pipeline. Independent penetration testing is performed at least every two years.

8. Data processors (in progress)
The formal subprocessor register and associated reassessment calendar are being refreshed and may not list every subprocessor until the end of Q2 2026.
`.trim();

/**
 * System prompt for EU-hosted LLM endpoints (OpenAI/Azure EU region or Anthropic via EU routing).
 * Wire this to your inference client; do not log raw document text or PII.
 */
export function buildNis2DocumentAnalysisSystemPrompt(): string {
  return [
    "You are an expert information-security assessor aligned with NIS2 Directive (EU) 2022/2555 Article 21 expectations.",
    "You receive (1) a numbered list of assessment questions as JSON and (2) a document excerpt from a vendor.",
    "For EACH question, decide if the excerpt provides sufficient evidence of compliance.",
    "Respond with ONLY a valid JSON array (no markdown fences). Each element must be an object with:",
    '- "questionId" (string, must match an input id e.g. "q1")',
    '- "status" (either "compliant" or "non-compliant")',
    '- "reasoning" (short string citing what the excerpt states or omits; no PII; English)',
    "If the excerpt is silent or ambiguous on a topic, use status non-compliant and explain the gap.",
  ].join(" ");
}

export function buildNis2DocumentAnalysisUserPayload(params: {
  questions: Nis2Question[];
  documentExcerpt: string;
}): string {
  const questionPayload = params.questions.map((q) => ({
    id: q.id,
    category: q.category,
    question: q.text,
    guidance: q.guidance ?? null,
  }));
  return JSON.stringify(
    {
      questions: questionPayload,
      documentExcerpt: params.documentExcerpt,
    },
    null,
    2,
  );
}
