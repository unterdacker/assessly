# AI Integration

## Overview

Assessly integrates AI to reduce manual work in the vendor assessment process. AI features are:

- **Optional** — the platform is fully functional without any AI provider
- **Auditable** — every AI action is logged to the audit trail with model ID, provider, and input hash
- **Human-in-the-loop** — AI suggestions require auditor confirmation before they influence the compliance score
- **EU AI Act compliant** — transparency, traceability, and human oversight are enforced by design

---

## AI Provider Abstraction (`lib/ai/provider.ts`)

The platform supports two AI backends, selectable per company:

### 1. Local (Ollama) — Default

```env
AI_PROVIDER=local
LOCAL_AI_ENDPOINT=http://localhost:11434
LOCAL_AI_MODEL=ministral-3:8b
```

Requests are sent to a locally running [Ollama](https://ollama.com/) instance via HTTP. No data leaves your infrastructure. The default model is `ministral-3:8b`. Any Ollama-compatible model can be substituted.

Inside Docker, use `http://host.docker.internal:11434` to reach Ollama running on the host OS.

### 2. Mistral AI (Cloud)

```env
AI_PROVIDER=mistral
MISTRAL_API_KEY=your_key_here
```

Uses the official `@mistralai/mistralai` SDK. Mistral AI is EU-hosted, which maintains the platform's commitment to keeping data in Europe.

The API key is stored **AES-256-GCM encrypted** in the `Company.mistralApiKey` database field and decrypted at runtime only when needed.

---

## AI Features

### 1. Document Analysis

**Trigger:** An auditor uploads a vendor security policy PDF.

**Flow:**
```
1. PDF text is extracted using pdfjs-dist
2. Text is chunked to fit the LLM context window
3. buildNis2DocumentAnalysisSystemPrompt() generates the system prompt
4. buildNis2DocumentAnalysisUserPayload() constructs the user message with:
     - The 20 NIS2 questions
     - The extracted document text
5. LLM returns a JSON array of question analyses:
     { questionId, status, confidence, evidenceSnippet, reasoning }
6. parseNis2AnalysisResults() validates and sanitizes the response
7. Each answer is saved as AssessmentAnswer with isAiSuggested=true
8. DOCUMENT_ANALYZED audit event logged with:
     - aiModelId
     - aiProviderName
     - inputContextHash (SHA-256 of document text — no PII stored)
```

**Safety:** The system prompt explicitly instructs the LLM to ignore any instructions embedded in the document text (prompt injection mitigation).

**Human verification:** Auditors must explicitly confirm each AI-suggested answer (setting `verified=true`) before it counts toward the compliance score.

### 2. Dashboard Executive Summary

**Trigger:** Admin/Auditor clicks **Refresh AI Summary** on the dashboard.

**Input data provided to the LLM (never raw PII):**
- Category compliance metrics (average scores, open gap counts)
- Vendor risk distribution (count per risk bucket)
- Vendor summaries (name, service type, risk level, open gap categories — no contact details)
- Average remediation cycle time in days

**Output:**
```typescript
{
  systemicRisk: string;            // Narrative risk summary paragraph
  averageRemediationTimeDays: number;
  recommendedCategoryKey: DashboardCategoryKey | null; // Highest-priority remediation focus
  source: "ai" | "fallback";      // Indicates whether AI responded or fallback was used
}
```

The summary is cached in `Company.lastAiSummary` / `Company.aiSummaryUpdatedAt` and served from cache on subsequent page loads until manually refreshed.

**Localisation:** The LLM is instructed to respond in the active locale (`en` or `de`).

### 3. Re-analysis

An auditor can trigger re-analysis of a previously uploaded document (`reanalyze-document.ts`) without re-uploading. This is useful when the questionnaire catalogue is updated or when the AI model is changed.

---

## EU AI Act Compliance

Assessly implements the following EU AI Act obligations:

| Article | Requirement | Implementation |
|---------|-------------|----------------|
| Art. 12 | Traceability of inputs | `inputContextHash` (SHA-256 of document) stored in every AI audit event |
| Art. 14 | Human oversight | `isAiSuggested` + `verified` flags; score only counts confirmed answers |
| Art. 14 | Model identification | `aiModelId` + `aiProviderName` logged on every AI event |
| Art. 14 (HITL) | Human-in-the-loop verification | `hitlVerifiedBy` field records the auditor who confirmed AI output |

---

## AI Settings (Per-Company)

Admins can configure the AI provider per tenant via **Settings → AI**:

- Switch between `local` and `mistral`
- Set the Ollama endpoint URL
- Set the Ollama model name
- Enter the Mistral API key (stored encrypted)

Changes are applied immediately; no restart required.

---

## Fallback Behaviour

If the AI provider is unavailable or returns an unparseable response, the platform:

1. Logs the failure to the structured logger (`AuditLogger.systemHealth`)
2. Returns `source: "fallback"` in summarisation responses
3. Leaves `AssessmentAnswer` rows unmodified for document analysis failures
4. Never blocks the assessment workflow

The simulation module (`lib/simulate-nis2-document-analysis.ts`) provides deterministic mock responses for testing without a live AI endpoint.
