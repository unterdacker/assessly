import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/vendor-assessment", async () => {
  const actual = await vi.importActual<typeof import("@/lib/vendor-assessment")>("@/lib/vendor-assessment");
  return {
    ...actual,
    calculateDossierCompletion: vi.fn().mockReturnValue(50),
  };
});

import type { VendorDomainMapper } from "@/lib/prisma-mappers";
import {
  deriveVendorStatus,
  riskLevelFromPrisma,
  riskLevelToPrisma,
  toVendorAssessment,
} from "@/lib/prisma-mappers";

describe("deriveVendorStatus", () => {
  it("derives completed when status is COMPLETED and answerCount is zero", () => {
    expect(deriveVendorStatus("COMPLETED", 0, 20)).toBe("completed");
  });

  it("derives incomplete when status is UNDER_REVIEW and answerCount is zero", () => {
    expect(deriveVendorStatus("UNDER_REVIEW", 0, 20)).toBe("incomplete");
  });

  it("derives pending for PENDING with zero answers", () => {
    expect(deriveVendorStatus("PENDING", 0, 20)).toBe("pending");
  });

  it("derives completed when answerCount reaches totalQuestions", () => {
    expect(deriveVendorStatus("PENDING", 20, 20)).toBe("completed");
    expect(deriveVendorStatus("COMPLETED", 20, 20)).toBe("completed");
  });

  it("derives incomplete for partial progress", () => {
    expect(deriveVendorStatus("PENDING", 5, 20)).toBe("incomplete");
    expect(deriveVendorStatus("COMPLETED", 5, 20)).toBe("incomplete");
  });

  it("keeps pending edge case when totalQuestions is zero", () => {
    expect(deriveVendorStatus("PENDING", 0, 0)).toBe("pending");
  });
});

describe("risk level mappings", () => {
  it("maps Prisma risk levels to domain levels", () => {
    expect(riskLevelFromPrisma("LOW")).toBe("low");
    expect(riskLevelFromPrisma("MEDIUM")).toBe("medium");
    expect(riskLevelFromPrisma("HIGH")).toBe("high");
    expect(riskLevelFromPrisma("CRITICAL" as any)).toBe("not_calculated");
  });

  it("maps domain risk levels to Prisma risk levels", () => {
    expect(riskLevelToPrisma("low")).toBe("LOW");
    expect(riskLevelToPrisma("medium")).toBe("MEDIUM");
    expect(riskLevelToPrisma("high")).toBe("HIGH");
    expect(riskLevelToPrisma("not_calculated")).toBe("MEDIUM");
  });
});

function makeVendor(): VendorDomainMapper {
  return {
    id: "vendor-001",
    name: "ACME",
    email: "v@example.com",
    serviceType: "SaaS",
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    createdBy: "user-xyz",
    accessCode: null,
    codeExpiresAt: null,
    isCodeActive: false,
    inviteSentAt: null,
    inviteTokenExpires: null,
    isFirstLogin: false,
    officialName: null,
    registrationId: null,
    vendorServiceType: null,
    securityOfficerName: null,
    securityOfficerEmail: null,
    dpoName: null,
    dpoEmail: null,
    headquartersLocation: null,
    sizeClassification: null,
  };
}

function makeAssessment() {
  return {
    id: "assessment-001",
    companyId: "company-abc",
    vendorId: "vendor-001",
    status: "PENDING" as const,
    riskLevel: "LOW" as any,
    complianceScore: 55,
    lastAssessmentDate: null,
    documentUrl: null,
    documentFilename: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
  } as any;
}

describe("toVendorAssessment", () => {
  it("maps joined vendor/assessment rows to the frontend model", () => {
    const mapped = toVendorAssessment(makeVendor(), makeAssessment(), 0, 20);

    expect(mapped.id).toBe("vendor-001");
    expect(mapped.name).toBe("ACME");
    expect(mapped.riskLevel).toBe("low");
    expect(mapped.complianceScore).toBe(55);
    expect(mapped.questionnaireProgress).toBe(0);
    expect(mapped.status).toBe("pending");
    expect(mapped.dossierCompletion).toBe(50);
  });
});
