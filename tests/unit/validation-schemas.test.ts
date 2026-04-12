import { describe, expect, it } from "vitest";
import {
  CreateInternalUserSchema,
  CreateVendorSchema,
  ForensicAuditSummaryQuerySchema,
  ForensicBundleQuerySchema,
  OverrideAnswerSchema,
  RemediationPostSchema,
  RemediationSendSchema,
  SaveAssessmentAnswerSchema,
  SendInviteSchema,
  UpdateAiSettingsSchema,
  UpdateExternalVendorProfileSchema,
  UpdateVendorProfileSchema,
} from "@/lib/validation/schemas";

const VALID_CUID = "ctest00000000000000000001";

describe("ForensicAuditSummaryQuerySchema", () => {
  it("defaults format to json", () => {
    const parsed = ForensicAuditSummaryQuerySchema.safeParse({});
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.format).toBe("json");
  });

  it("accepts csv format", () => {
    expect(ForensicAuditSummaryQuerySchema.safeParse({ format: "csv" }).success).toBe(true);
  });

  it("rejects unknown format", () => {
    expect(ForensicAuditSummaryQuerySchema.safeParse({ format: "xml" }).success).toBe(false);
  });
});

describe("ForensicBundleQuerySchema", () => {
  it("accepts empty input", () => {
    expect(ForensicBundleQuerySchema.safeParse({}).success).toBe(true);
  });

  it("accepts valid category", () => {
    expect(ForensicBundleQuerySchema.safeParse({ category: "AUTH" }).success).toBe(true);
  });

  it("rejects invalid category", () => {
    expect(ForensicBundleQuerySchema.safeParse({ category: "INVALID" }).success).toBe(false);
  });
});

describe("RemediationPostSchema", () => {
  it("accepts valid vendorId and defaults deadlineDays", () => {
    const parsed = RemediationPostSchema.safeParse({ vendorId: VALID_CUID });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.deadlineDays).toBe(14);
  });

  it("rejects invalid cuid", () => {
    expect(RemediationPostSchema.safeParse({ vendorId: "not-cuid" }).success).toBe(false);
  });

  it("validates deadlineDays range", () => {
    expect(RemediationPostSchema.safeParse({ vendorId: VALID_CUID, deadlineDays: 0 }).success).toBe(false);
    expect(RemediationPostSchema.safeParse({ vendorId: VALID_CUID, deadlineDays: 366 }).success).toBe(false);
    expect(RemediationPostSchema.safeParse({ vendorId: VALID_CUID, deadlineDays: 365 }).success).toBe(true);
  });
});

describe("RemediationSendSchema", () => {
  it("accepts valid payload", () => {
    expect(
      RemediationSendSchema.safeParse({
        vendorId: VALID_CUID,
        recipientEmail: "valid@example.com",
        finalDraft: "short draft",
      }).success,
    ).toBe(true);
  });

  it("rejects invalid email", () => {
    expect(
      RemediationSendSchema.safeParse({
        vendorId: VALID_CUID,
        recipientEmail: "bad-email",
        finalDraft: "x",
      }).success,
    ).toBe(false);
  });

  it("rejects oversized finalDraft", () => {
    expect(
      RemediationSendSchema.safeParse({
        vendorId: VALID_CUID,
        recipientEmail: "valid@example.com",
        finalDraft: "x".repeat(50_001),
      }).success,
    ).toBe(false);
  });
});

describe("CreateInternalUserSchema", () => {
  it("accepts ADMIN", () => {
    expect(CreateInternalUserSchema.safeParse({ email: "test@example.com", role: "ADMIN" }).success).toBe(true);
  });

  it("rejects VENDOR role", () => {
    expect(CreateInternalUserSchema.safeParse({ email: "test@example.com", role: "VENDOR" }).success).toBe(false);
  });
});

describe("CreateVendorSchema", () => {
  it("rejects overly long names", () => {
    expect(CreateVendorSchema.safeParse({ name: "x".repeat(201), email: "a@b.com" }).success).toBe(false);
  });

  it("accepts valid input", () => {
    expect(CreateVendorSchema.safeParse({ name: "ACME", email: "a@b.com" }).success).toBe(true);
  });
});

describe("SendInviteSchema", () => {
  it("accepts valid payload", () => {
    expect(
      SendInviteSchema.safeParse({
        vendorId: VALID_CUID,
        email: "a@b.com",
        phone: "+4915123456789",
        duration: "24h",
      }).success,
    ).toBe(true);
  });

  it("rejects phone values without plus prefix", () => {
    expect(
      SendInviteSchema.safeParse({
        vendorId: VALID_CUID,
        email: "a@b.com",
        phone: "4915123456789",
        duration: "24h",
      }).success,
    ).toBe(false);
  });

  it("accepts empty phone", () => {
    expect(
      SendInviteSchema.safeParse({
        vendorId: VALID_CUID,
        email: "a@b.com",
        phone: "",
        duration: "24h",
      }).success,
    ).toBe(true);
  });

  it("rejects unsupported durations", () => {
    expect(
      SendInviteSchema.safeParse({
        vendorId: VALID_CUID,
        email: "a@b.com",
        phone: "+4915123456789",
        duration: "2h",
      }).success,
    ).toBe(false);
  });
});

describe("OverrideAnswerSchema", () => {
  it("rejects oversized evidence base64", () => {
    expect(
      OverrideAnswerSchema.safeParse({
        assessmentId: VALID_CUID,
        questionId: "q1",
        status: "COMPLIANT",
        manualNotes: "notes",
        evidencePdfBase64: "x".repeat(14_000_001),
      }).success,
    ).toBe(false);
  });
});

describe("SaveAssessmentAnswerSchema", () => {
  it("accepts all supported statuses", () => {
    const statuses = [
      "COMPLIANT",
      "NON_COMPLIANT",
      "NOT_APPLICABLE",
      "PARTIALLY_COMPLIANT",
      "FLAGGED",
    ] as const;

    for (const status of statuses) {
      expect(
        SaveAssessmentAnswerSchema.safeParse({
          assessmentId: VALID_CUID,
          questionId: "q1",
          status,
        }).success,
      ).toBe(true);
    }
  });

  it("rejects unknown status", () => {
    expect(
      SaveAssessmentAnswerSchema.safeParse({
        assessmentId: VALID_CUID,
        questionId: "q1",
        status: "INVALID",
      }).success,
    ).toBe(false);
  });
});

describe("UpdateExternalVendorProfileSchema", () => {
  it("requires token", () => {
    expect(UpdateExternalVendorProfileSchema.safeParse({}).success).toBe(false);
  });

  it("accepts token-only payload", () => {
    expect(UpdateExternalVendorProfileSchema.safeParse({ token: "abc" }).success).toBe(true);
  });

  it("accepts empty optional email fields", () => {
    expect(
      UpdateExternalVendorProfileSchema.safeParse({
        token: "abc",
        securityOfficerEmail: "",
        dpoEmail: "",
      }).success,
    ).toBe(true);
  });
});

describe("UpdateVendorProfileSchema", () => {
  it("accepts valid payload", () => {
    expect(
      UpdateVendorProfileSchema.safeParse({
        vendorId: VALID_CUID,
        officialName: "Acme GmbH",
      }).success,
    ).toBe(true);
  });

  it("rejects invalid vendorId", () => {
    expect(UpdateVendorProfileSchema.safeParse({ vendorId: "invalid" }).success).toBe(false);
  });
});

describe("UpdateAiSettingsSchema", () => {
  it("coerces aiDisabled from string values", () => {
    const parsed = UpdateAiSettingsSchema.safeParse({
      companyId: VALID_CUID,
      aiProvider: "mistral",
      aiDisabled: "on",
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.aiDisabled).toBe(true);
  });

  it("accepts valid local provider endpoint", () => {
    expect(
      UpdateAiSettingsSchema.safeParse({
        companyId: VALID_CUID,
        aiProvider: "local",
        localAiEndpoint: "https://ai.example.com/v1",
        localAiModel: "llama3.1",
      }).success,
    ).toBe(true);
  });

  it("rejects invalid local endpoint URL", () => {
    expect(
      UpdateAiSettingsSchema.safeParse({
        companyId: VALID_CUID,
        aiProvider: "local",
        localAiEndpoint: "not-a-url",
      }).success,
    ).toBe(false);
  });
});
