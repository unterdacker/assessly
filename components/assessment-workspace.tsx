"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
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

type AssessmentWorkspaceProps = {
  vendorAssessment: VendorAssessment;
  assessmentId: string;
  companyId: string;
  initialAnswers: AssessmentAnswer[];
  documentUrl: string | null;
  documentFilename: string | null;
};

export function AssessmentWorkspace({
  vendorAssessment,
  assessmentId,
  companyId,
  initialAnswers,
  documentUrl,
  documentFilename,
}: AssessmentWorkspaceProps) {
  const t = useTranslations("assessment.workspace");
  const insightLines = buildVendorAssessmentInsightLines(vendorAssessment);
  
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
          <section className="max-h-[600px] overflow-y-auto rounded-lg border border-slate-200 bg-card p-3 dark:border-slate-800">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("aiDocumentAudit")}</h2>
            <PdfUploadZone vendorId={vendorAssessment.id} isAdminView />
            {documentUrl && (
              <div className="mt-2 flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 dark:border-slate-700 dark:bg-slate-900">
                <span className="flex-1 truncate text-[11px] text-muted-foreground">
                  {t("evidenceOnFile")} <span className="font-medium text-foreground">{documentFilename}</span>
                </span>
                <Button variant="outline" size="sm" className="h-7 shrink-0" asChild>
                  <a href={documentUrl} target="_blank" rel="noopener noreferrer">
                    {t("viewPdf")}
                  </a>
                </Button>
              </div>
            )}
          </section>

          <VendorAssessmentSidePanels
            insightLines={insightLines}
            assessmentId={assessmentId}
            answers={initialAnswers}
            selectedQuestionId={selectedQuestionId}
          />
        </div>
      </div>
    </div>
  );
}
