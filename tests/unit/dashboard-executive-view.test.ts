import { describe, expect, it } from "vitest";
import {
  buildExecutiveMetrics,
  countCompletedAssessments,
} from "@/lib/dashboard-executive-view";
import type { VendorAssessment } from "@/lib/vendor-assessment";

function makeVendorAssessment(id: string, status: VendorAssessment["status"]): VendorAssessment {
  return {
    id,
    name: `Vendor ${id}`,
    accessCode: null,
    codeExpiresAt: null,
    isCodeActive: false,
    inviteSentAt: null,
    inviteTokenExpires: null,
    isFirstLogin: false,
    email: `vendor-${id}@example.com`,
    serviceType: "SaaS",
    lastAssessmentDate: null,
    riskLevel: "medium",
    status,
    complianceScore: 60,
    documentUrl: null,
    documentFilename: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    dueDate: null,
    createdBy: "test-user",
    dossierCompletion: 100,
    questionnaireProgress: 100,
    questionsFilled: 20,
  };
}

describe("dashboard-executive-view helpers", () => {
  it("counts completed assessments case-insensitively against COMPLETED", () => {
    const assessments: VendorAssessment[] = [
      makeVendorAssessment("1", "completed"),
      makeVendorAssessment("2", "incomplete"),
      makeVendorAssessment("3", "pending"),
    ];

    expect(countCompletedAssessments(assessments)).toBe(1);
  });

  it("builds only base metrics for non-premium users", () => {
    const metrics = buildExecutiveMetrics({
      openRemediationCount: 3,
      completedAssessments: 5,
      overdueAssessmentsCount: 2,
      isPremium: false,
      slaComplianceRate: 91.23,
      labels: {
        openRemediations: "Open Remediations",
        completedAssessments: "Completed",
        overdueAssessments: "Overdue",
        slaComplianceRate: "SLA Compliance",
      },
    });

    expect(metrics).toEqual([
      { label: "Open Remediations", value: "3" },
      { label: "Completed", value: "5" },
    ]);
  });

  it("includes premium metrics and formats SLA to one decimal place", () => {
    const metrics = buildExecutiveMetrics({
      openRemediationCount: 1,
      completedAssessments: 2,
      overdueAssessmentsCount: 4,
      isPremium: true,
      slaComplianceRate: 91.23,
      labels: {
        openRemediations: "Open Remediations",
        completedAssessments: "Completed",
        overdueAssessments: "Overdue",
        slaComplianceRate: "SLA Compliance",
      },
    });

    expect(metrics).toEqual([
      { label: "Open Remediations", value: "1" },
      { label: "Completed", value: "2" },
      { label: "Overdue", value: "4" },
      { label: "SLA Compliance", value: "91.2%" },
    ]);
  });

  it("hides SLA metric when premium is enabled but SLA rate is zero", () => {
    const metrics = buildExecutiveMetrics({
      openRemediationCount: 1,
      completedAssessments: 2,
      overdueAssessmentsCount: 4,
      isPremium: true,
      slaComplianceRate: 0,
      labels: {
        openRemediations: "Open Remediations",
        completedAssessments: "Completed",
        overdueAssessments: "Overdue",
        slaComplianceRate: "SLA Compliance",
      },
    });

    expect(metrics).toEqual([
      { label: "Open Remediations", value: "1" },
      { label: "Completed", value: "2" },
      { label: "Overdue", value: "4" },
    ]);
  });
});
