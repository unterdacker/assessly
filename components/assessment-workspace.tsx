"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { UserRole } from "@prisma/client";
import { ArrowLeft } from "lucide-react";
import type { AssessmentAnswer } from "@prisma/client";
import type { VendorAssessment } from "@/lib/vendor-assessment";
import { Button } from "@/components/ui/button";
import { PdfUploadZone } from "@/components/pdf-upload-zone";
import { RiskBadge } from "@/components/risk-badge";
import { scoreGaugeColor } from "@/lib/score-colors";
import { cn } from "@/lib/utils";
import { buildVendorAssessmentInsightLines } from "@/lib/vendor-assessment-insights";
import { VendorAssessmentQuestionnairePanel } from "@/components/vendor-assessment-questionnaire-panel";
import { VendorAssessmentSidePanels } from "@/components/vendor-assessment-side-panels";
import { EditVendorProfileModal } from "@/components/edit-vendor-profile-modal";
import { VendorDetailsCard } from "@/components/vendor-details-card";
import { RemediationModal } from "@/components/remediation-modal";

type AssessmentWorkspaceProps = {
  vendorAssessment: VendorAssessment;
  assessmentId: string;
  companyId: string;
  initialAnswers: AssessmentAnswer[];
  documentUrl: string | null;
  documentFilename: string | null;
  documentFileSize: number | null;
  lastAuditedAt: string | null;
  role: UserRole;
};

export function AssessmentWorkspace({
  vendorAssessment,
  assessmentId,
  companyId,
  initialAnswers,
  documentUrl,
  documentFilename,
  documentFileSize,
  lastAuditedAt,
  role,
}: AssessmentWorkspaceProps) {
  const t = useTranslations("assessment.workspace");
  const insightLines = buildVendorAssessmentInsightLines(vendorAssessment);
  const isAdmin = role === "ADMIN";
  const isReadOnly = role !== "ADMIN";
  
  // Track selected question for side-by-side view
  const [selectedQuestionId, setSelectedQuestionId] = React.useState<string | null>(null);

  // PDF upload and AI audit are handled inside PdfUploadZone.


  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <Button variant="ghost" size="sm" className="-ml-2 w-fit gap-1" asChild>
            <Link href="/vendors">
              <ArrowLeft className="h-4 w-4" aria-hidden />
              {t("backToVendors")}
            </Link>
          </Button>
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
            {vendorAssessment.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("title")} · {vendorAssessment.serviceType}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RiskBadge level={vendorAssessment.riskLevel} />
          <span
            className={cn(
              "rounded-md border border-slate-200 px-2 py-1 text-xs font-medium tabular-nums dark:border-slate-700",
              scoreGaugeColor(vendorAssessment.complianceScore),
            )}
          >
            {t("score")} {vendorAssessment.complianceScore}/100
          </span>
          {isAdmin ? <RemediationModal vendorId={vendorAssessment.id} /> : null}
          {isAdmin ? (
            <EditVendorProfileModal
              vendorId={vendorAssessment.id}
              companyId={companyId}
              initialData={{
                officialName: vendorAssessment.vendor?.officialName || vendorAssessment.name,
                registrationId: vendorAssessment.vendor?.registrationId,
                vendorServiceType: vendorAssessment.vendor?.vendorServiceType || vendorAssessment.serviceType,
                securityOfficerName: vendorAssessment.vendor?.securityOfficerName,
                securityOfficerEmail: vendorAssessment.vendor?.securityOfficerEmail,
                dpoName: vendorAssessment.vendor?.dpoName,
                dpoEmail: vendorAssessment.vendor?.dpoEmail,
                headquartersLocation: vendorAssessment.vendor?.headquartersLocation,
              }}
              trigger={
                <Button variant="outline" size="sm">
                  {t("editVendorInfo")}
                </Button>
              }
            />
          ) : null}
        </div>
      </header>

      {/* Persistent Vendor Dossier: Heading and detailed info grid */}
      <VendorDetailsCard 
        vendorAssessment={vendorAssessment} 
        companyId={companyId} 
      />

      <div className="grid gap-4 lg:grid-cols-12 lg:items-start">
        <div className="lg:col-span-7">
          <VendorAssessmentQuestionnairePanel
            answers={initialAnswers}
            selectedQuestionId={selectedQuestionId}
            onSelectQuestion={setSelectedQuestionId}
          />
        </div>

        <div className="space-y-4 lg:col-span-5">
          <div className="max-h-[600px] overflow-y-auto">
            <PdfUploadZone
              vendorId={vendorAssessment.id}
              isAdminView
              readOnly={isReadOnly}
              assessmentId={assessmentId}
              storedDocumentFilename={documentFilename}
              documentUrl={documentUrl}
              storedDocumentSize={documentFileSize}
              lastAuditedAt={lastAuditedAt}
            />
          </div>

          <VendorAssessmentSidePanels
            insightLines={insightLines}
            assessmentId={assessmentId}
            answers={initialAnswers}
            selectedQuestionId={selectedQuestionId}
            readOnly={isReadOnly}
          />
        </div>
      </div>
    </div>
  );
}
