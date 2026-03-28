export type Nis2Question = {
  id: string;
  category: string;
  text: string;
  guidance?: string;
};

/**
 * Immutable questionnaire catalogue version (reference data). Ship updates via releases;
 * per-question DB rows would carry their own audit trail in a full backend.
 */
export const NIS2_QUESTIONNAIRE_VERSION = "2026.1";

/** Twenty NIS2-aligned security assessment questions, grouped by category for the workspace UI. */
export const nis2Questions: Nis2Question[] = [
  {
    id: "q1",
    category: "Governance & Risk Management",
    text: "Does the vendor maintain a documented information security policy approved by management?",
    guidance: "Policy should cover roles, acceptable use, and review cadence.",
  },
  {
    id: "q2",
    category: "Governance & Risk Management",
    text: "Is there a designated security officer or equivalent accountable for cybersecurity?",
  },
  {
    id: "q3",
    category: "Governance & Risk Management",
    text: "Are cybersecurity risks assessed at least annually and after major changes?",
  },
  {
    id: "q4",
    category: "Access & Identity",
    text: "Is multi-factor authentication enforced for all administrative and remote access?",
  },
  {
    id: "q5",
    category: "Access & Identity",
    text: "Are least-privilege and role-based access controls applied to production systems?",
  },
  {
    id: "q6",
    category: "Access & Identity",
    text: "Is access reviewed periodically and revoked promptly on role change or offboarding?",
  },
  {
    id: "q7",
    category: "Data Protection & Privacy",
    text: "Is personal and sensitive data classified, with handling rules documented?",
  },
  {
    id: "q8",
    category: "Data Protection & Privacy",
    text: "Are data processing agreements and subprocessors documented and kept current?",
  },
  {
    id: "q9",
    category: "Data Protection & Privacy",
    text: "Is data encrypted in transit and at rest using industry-accepted algorithms?",
  },
  {
    id: "q10",
    category: "Cryptography & Key Management",
    text: "Are cryptographic keys generated, stored, and rotated according to a defined process?",
  },
  {
    id: "q11",
    category: "Cryptography & Key Management",
    text: "Is use of customer-managed keys or HSMs supported where required?",
  },
  {
    id: "q12",
    category: "Operations & Monitoring",
    text: "Are security logs collected centrally with retention aligned to regulatory needs?",
  },
  {
    id: "q13",
    category: "Operations & Monitoring",
    text: "Is 24/7 monitoring in place for critical services with defined escalation paths?",
  },
  {
    id: "q14",
    category: "Operations & Monitoring",
    text: "Are vulnerability management and patch SLAs defined and evidenced?",
  },
  {
    id: "q15",
    category: "Incident & Business Continuity",
    text: "Does the vendor maintain an incident response plan with customer notification clauses?",
  },
  {
    id: "q16",
    category: "Incident & Business Continuity",
    text: "Are incident exercises or tabletop tests performed and improvements tracked?",
  },
  {
    id: "q17",
    category: "Incident & Business Continuity",
    text: "Are business continuity and disaster recovery plans tested with defined RTO/RPO?",
  },
  {
    id: "q18",
    category: "Supply Chain & Development",
    text: "Is secure SDLC practiced (threat modeling, code review, dependency scanning)?",
  },
  {
    id: "q19",
    category: "Supply Chain & Development",
    text: "Are third-party components and open-source licenses tracked and monitored?",
  },
  {
    id: "q20",
    category: "Supply Chain & Development",
    text: "Are penetration tests or independent security assessments performed regularly?",
  },
];

export function groupQuestionsByCategory(
  questions: Nis2Question[],
): Record<string, Nis2Question[]> {
  return questions.reduce<Record<string, Nis2Question[]>>((acc, q) => {
    if (!acc[q.category]) acc[q.category] = [];
    acc[q.category].push(q);
    return acc;
  }, {});
}
