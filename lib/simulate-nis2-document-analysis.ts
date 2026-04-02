import { nis2Questions } from "@/lib/nis2-questions";
import type { Nis2QuestionAnalysis } from "@/lib/nis2-question-analysis";
import { SIMULATED_VENDOR_DOCUMENT_SNIPPET } from "@/lib/nis2-document-analysis-prompt";

/**
 * Deterministic simulation of LLM JSON output from the policy snippet.
 * Swap for a real EU-region inference call using `buildNis2DocumentAnalysisSystemPrompt`
 * and `buildNis2DocumentAnalysisUserPayload` when integrating OpenAI / Anthropic.
 */
export function simulateNis2DocumentAnalysis(
  documentExcerpt: string = SIMULATED_VENDOR_DOCUMENT_SNIPPET,
): Nis2QuestionAnalysis[] {
  const text = documentExcerpt.toLowerCase();
  const has = (fragments: string[]) =>
    fragments.every((f) => text.includes(f.toLowerCase()));

  return nis2Questions.map((q): Nis2QuestionAnalysis => {
    switch (q.id) {
      case "q1":
        return {
          questionId: q.id,
          status: has(["information security policy", "approved"])
            ? "compliant"
            : "non-compliant",
          reasoning: has(["information security policy", "approved"])
            ? "Excerpt states the policy is Board-approved and reviewed annually."
            : "No clear evidence of a management-approved security policy.",
          evidenceSnippet: "",
        };
      case "q2":
        return {
          questionId: q.id,
          status: has(["chief information security officer", "ciso"])
            ? "compliant"
            : "non-compliant",
          reasoning: has(["chief information security officer", "ciso"])
            ? "A CISO is named with explicit accountability."
            : "No designated security officer is described.",
          evidenceSnippet: "",
        };
      case "q3":
        return {
          questionId: q.id,
          status: has(["assessed annually", "major"])
            ? "compliant"
            : "non-compliant",
          reasoning: has(["assessed annually", "major"])
            ? "Annual assessments and major-change triggers are mentioned."
            : "Risk assessment cadence is not evidenced.",
          evidenceSnippet: "",
        };
      case "q4":
        return {
          questionId: q.id,
          status: has(["multi-factor", "administrative"])
            ? "compliant"
            : "non-compliant",
          reasoning: has(["multi-factor", "administrative"])
            ? "MFA is required for administrative access paths."
            : "MFA coverage is not described.",
          evidenceSnippet: "",
        };
      case "q5":
        return {
          questionId: q.id,
          status: "non-compliant",
          reasoning:
            "Least-privilege and RBAC for production are not explicitly described in the excerpt.",
          evidenceSnippet: "",
        };
      case "q6":
        return {
          questionId: q.id,
          status: "non-compliant",
          reasoning:
            "Periodic access reviews and timely revocation are not evidenced.",
          evidenceSnippet: "",
        };
      case "q7":
        return {
          questionId: q.id,
          status: "non-compliant",
          reasoning:
            "Data classification and handling rules are not stated in the provided text.",
          evidenceSnippet: "",
        };
      case "q8":
        return {
          questionId: q.id,
          status: "non-compliant",
          reasoning:
            "Subprocessors are acknowledged but the register is incomplete until Q2 2026.",
          evidenceSnippet: "",
        };
      case "q9":
        return {
          questionId: q.id,
          status: has(["tls", "aes-256"]) ? "compliant" : "non-compliant",
          reasoning: has(["tls", "aes-256"])
            ? "Encryption in transit (TLS 1.2+) and at rest (AES-256) is stated."
            : "Encryption practises are not documented here.",
          evidenceSnippet: "",
        };
      case "q10":
        return {
          questionId: q.id,
          status: "non-compliant",
          reasoning:
            "Key generation, storage, and rotation processes are not detailed.",
          evidenceSnippet: "",
        };
      case "q11":
        return {
          questionId: q.id,
          status: "non-compliant",
          reasoning:
            "Customer-managed keys or HSM support is not mentioned.",
          evidenceSnippet: "",
        };
      case "q12":
        return {
          questionId: q.id,
          status: has(["logs", "twelve months"])
            ? "compliant"
            : "non-compliant",
          reasoning: has(["logs", "twelve months"])
            ? "Central logging with a twelve-month retention is described."
            : "Logging and retention are not evidenced.",
          evidenceSnippet: "",
        };
      case "q13":
        return {
          questionId: q.id,
          status: "non-compliant",
          reasoning:
            "24/7 monitoring and escalation paths are not described in this excerpt.",
          evidenceSnippet: "",
        };
      case "q14": {
        const ok = has(["patches", "fourteen days"]);
        return {
          questionId: q.id,
          status: ok ? "compliant" : "non-compliant",
          reasoning: ok
            ? "Critical patch application timelines are documented."
            : "Patch SLAs are not evidenced.",
          evidenceSnippet: "",
        };
      }
      case "q15":
        return {
          questionId: q.id,
          status: has(["incident response", "notification"])
            ? "compliant"
            : "non-compliant",
          reasoning: has(["incident response", "notification"])
            ? "An IR plan with customer notification expectations exists."
            : "Incident response commitments are missing.",
          evidenceSnippet: "",
        };
      case "q16":
        return {
          questionId: q.id,
          status: "non-compliant",
          reasoning:
            "Tabletop exercises and tracked improvements are not mentioned.",
          evidenceSnippet: "",
        };
      case "q17":
        return {
          questionId: q.id,
          status: has(["disaster recovery", "four hours"])
            ? "compliant"
            : "non-compliant",
          reasoning: has(["disaster recovery", "four hours"])
            ? "Yearly BC/DR testing with RPO under four hours is claimed."
            : "BC/DR testing evidence is insufficient here.",
          evidenceSnippet: "",
        };
      case "q18":
        return {
          questionId: q.id,
          status: has(["ci/cd", "dependency"])
            ? "compliant"
            : "non-compliant",
          reasoning: has(["ci/cd", "dependency"])
            ? "CI/CD integration with dependency scanning indicates SDLC controls."
            : "Secure SDLC elements are not evidenced.",
          evidenceSnippet: "",
        };
      case "q19":
        return {
          questionId: q.id,
          status: "non-compliant",
          reasoning:
            "Open-source license tracking is not addressed in the excerpt.",
          evidenceSnippet: "",
        };
      case "q20":
        return {
          questionId: q.id,
          status: has(["penetration"]) ? "compliant" : "non-compliant",
          reasoning: has(["penetration"])
            ? "Independent penetration testing on a defined cadence is stated."
            : "Independent security testing is not evidenced.",
          evidenceSnippet: "",
        };
      default:
        return {
          questionId: q.id,
          status: "non-compliant",
          reasoning:
            "Insufficient evidence in the simulated excerpt for this control.",
          evidenceSnippet: "",
        };
    }
  });
}
