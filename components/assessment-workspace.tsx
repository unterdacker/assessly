"use client";

import * as React from "react";
import Link from "next/link";
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
              Back to vendors
            </Link>
          </Button>
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
            {vendorAssessment.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            Assessment workspace · {vendorAssessment.serviceType}
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
            Score {vendorAssessment.complianceScore}/100
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
                Edit Vendor Info
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

      <section className="rounded-lg border border-slate-200 bg-card p-4 dark:border-slate-800">
        <h2 className="text-sm font-semibold mb-3">AI document audit (PDF upload)</h2>
        <PdfUploadZone vendorId={vendorAssessment.id} />
        {documentUrl && (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
            <span className="text-xs text-muted-foreground flex-1 truncate">
              Evidence on file: <span className="font-medium text-foreground">{documentFilename}</span>
            </span>
            <Button variant="outline" size="sm" className="h-7 shrink-0" asChild>
              <a href={documentUrl} target="_blank" rel="noopener noreferrer">
                View PDF
              </a>
            </Button>
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <VendorAssessmentQuestionnairePanel
          answers={initialAnswers}
          selectedQuestionId={selectedQuestionId}
          onSelectQuestion={setSelectedQuestionId}
        />
        <VendorAssessmentSidePanels 
          insightLines={insightLines}
          assessmentId={assessmentId}
          answers={initialAnswers}
          selectedQuestionId={selectedQuestionId}
        />
      </div>
    </div>
  );
}
