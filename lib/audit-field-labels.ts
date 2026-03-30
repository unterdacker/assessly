/**
 * Human-readable field label mapping for audit log display.
 * Maps technical field names to user-friendly labels for the audit trail UI.
 */

export const FIELD_LABELS: Record<string, string> = {
  // Assessment Answer fields
  status: "Status",
  findings: "Findings",
  justificationText: "Justification",
  evidenceSnippet: "Evidence Snippet",
  evidenceFileName: "Evidence File",
  evidenceFileUrl: "Evidence URL",
  verified: "Verified",
  manualNotes: "Manual Notes",
  evidenceUrl: "Evidence URL",
  overrideReason: "Override Reason",
  complianceScore: "Compliance Score",
  aiConfidence: "AI Confidence",
  aiReasoning: "AI Reasoning",

  // Vendor Access Code fields
  isCodeActive: "Code Active",
  codeExpiresAt: "Expires At",
  duration: "Duration",
  masked_access_code: "Access Code",

  // Vendor fields
  name: "Name",
  email: "Email",
  serviceType: "Service Type",
  registrationId: "Registration ID",
  securityOfficerName: "Security Officer",
  dpoName: "Data Protection Officer",
  passwordHash: "Password",

  // Settings
  aiProvider: "AI Provider",
  mistralApiKey: "Mistral API Key",
  localAiEndpoint: "Local AI Endpoint",
};

export function getFieldLabel(fieldName: string): string {
  return FIELD_LABELS[fieldName] || fieldName;
}

export function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "—";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (typeof value === "string" && value.length > 100) {
    return value.slice(0, 100) + "...";
  }

  if (typeof value === "object") {
    try {
      const json = JSON.stringify(value, null, 2);
      return json.length > 200 ? json.slice(0, 200) + "..." : json;
    } catch {
      return String(value);
    }
  }

  return String(value);
}
