/**
 * Venshield — Shared Zod validation schemas
 *
 * These schemas should be imported by API route handlers and server actions to
 * replace ad-hoc manual validation.  Each schema mirrors the exact input shape
 * of its corresponding endpoint and is safe to use in both server and client
 * contexts (no server-only imports here).
 *
 * Usage example:
 *   const result = RemediationPostSchema.safeParse(await request.json());
 *   if (!result.success) return NextResponse.json({ error: result.error.flatten() }, { status: 400 });
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Primitives / shared
// ---------------------------------------------------------------------------

const cuid = z.string().regex(/^c[a-z0-9]{20,}$/, "Must be a valid CUID");
const emailAddress = z.string().trim().email("Must be a valid email address").max(254);
const nonEmptyString = z.string().trim().min(1, "This field is required");

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------

/**
 * GET /api/admin/forensic-audit-summary?format=json|csv
 */
export const ForensicAuditSummaryQuerySchema = z.object({
  format: z.enum(["json", "csv"]).default("json"),
});

/**
 * GET /api/audit-logs/forensic-bundle?category=<string>
 * Allowed compliance category values from the schema comment.
 */
export const ForensicBundleQuerySchema = z.object({
  category: z
    .enum(["AI_ACT", "AUTH", "CONFIG", "NIS2_DORA", "ISO27001_SOC2", "BSI_TISAX", "OTHER"])
    .optional(),
});

/**
 * POST /api/remediation
 * Triggers AI-powered remediation email draft generation.
 */
export const RemediationPostSchema = z.object({
  vendorId: cuid,
  locale: z.enum(["en", "de"]).optional(),
  deadlineDays: z.number().int().min(1).max(365).optional().default(14),
});

/**
 * POST /api/remediation/send
 * Records a remediation email send event in the audit log.
 */
export const RemediationSendSchema = z.object({
  vendorId: cuid,
  recipientEmail: emailAddress,
  finalDraft: z.string().trim().min(1).max(50_000),
  originalAiOutput: z.string().max(50_000).optional(),
  aiGenerationEventId: z.string().nullable().optional(),
});

// ---------------------------------------------------------------------------
// Server actions
// ---------------------------------------------------------------------------

/**
 * app/actions/iam.ts — createInternalUser
 */
export const CreateInternalUserSchema = z.object({
  email: emailAddress,
  role: z.enum(["SUPER_ADMIN", "ADMIN", "RISK_REVIEWER", "AUDITOR"]),
});

/**
 * app/actions/vendor-actions.ts — createVendorAction
 */
export const CreateVendorSchema = z.object({
  name: nonEmptyString.max(200),
  email: emailAddress,
});

/**
 * app/actions/send-invite.ts — sendOutOfBandInviteAction
 */
export const SendInviteSchema = z.object({
  vendorId: cuid,
  email: emailAddress,
  phone: z
    .string()
    .regex(/^\+[1-9]\d{6,14}$/, "Phone number must be in E.164 format (+1234567890)")
    .optional()
    .or(z.literal("")),
  duration: z.enum(["1h", "24h", "7d", "30d"]).default("24h"),
  locale: z.enum(["en", "de"]).default("en"),
});

/**
 * app/actions/external-portal-actions.ts — updateExternalVendorProfileByToken
 */
export const UpdateExternalVendorProfileSchema = z.object({
  token: nonEmptyString,
  officialName: z.string().trim().max(250).optional(),
  registrationId: z.string().trim().max(100).optional(),
  vendorServiceType: z.string().trim().max(100).optional(),
  headquartersLocation: z.string().trim().max(250).optional(),
  securityOfficerName: z.string().trim().max(200).optional(),
  securityOfficerEmail: emailAddress.optional().or(z.literal("")),
  dpoName: z.string().trim().max(200).optional(),
  dpoEmail: emailAddress.optional().or(z.literal("")),
});

/**
 * app/actions/update-vendor-profile.ts — updateVendorProfile
 */
export const UpdateVendorProfileSchema = z.object({
  vendorId: cuid,
  officialName: z.string().trim().max(250).optional(),
  registrationId: z.string().trim().max(100).optional(),
  vendorServiceType: z.string().trim().max(100).optional(),
  securityOfficerName: z.string().trim().max(200).optional(),
  securityOfficerEmail: emailAddress.optional().or(z.literal("")),
  dpoName: z.string().trim().max(200).optional(),
  dpoEmail: emailAddress.optional().or(z.literal("")),
  headquartersLocation: z.string().trim().max(250).optional(),
});

/**
 * app/actions/update-answer-override.ts — overrideAssessmentAnswer
 */
export const OverrideAnswerSchema = z.object({
  assessmentId: cuid,
  questionId: nonEmptyString,
  status: z.enum(["COMPLIANT", "NON_COMPLIANT"]),
  manualNotes: nonEmptyString.max(5_000),
  // base64-encoded file — validate max decoded size (≈ 10 MB = ~13.3 MB base64)
  evidencePdfBase64: z.string().max(14_000_000).optional(),
  evidencePdfFilename: z.string().trim().max(255).optional(),
});

/**
 * app/actions/vendor-assessment-actions.ts — saveAssessmentAnswer
 */
export const SaveAssessmentAnswerSchema = z.object({
  assessmentId: cuid,
  questionId: nonEmptyString,
  status: z.enum(["COMPLIANT", "NON_COMPLIANT", "NOT_APPLICABLE", "PARTIALLY_COMPLIANT", "FLAGGED"]),
  findings: z.string().trim().max(5_000).optional(),
  evidenceSnippet: z.string().trim().max(2_000).optional(),
  overrideReason: nonEmptyString.max(2_000).optional(),
});

/**
 * app/actions/update-settings.ts — updateAiSettings (form fields)
 */
export const UpdateAiSettingsSchema = z.object({
  companyId: cuid,
  aiProvider: z.enum(["mistral", "local"]),
  aiDisabled: z.preprocess(
    (v) => v === "on" || v === "true" || v === true,
    z.boolean()
  ).optional(),
  mistralApiKey: z.string().max(512).optional(),
  localAiEndpoint: z.string().url("Must be a valid URL").max(500).optional(),
  localAiModel: z.string().trim().max(100).optional(),
});
