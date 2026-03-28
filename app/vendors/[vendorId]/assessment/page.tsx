import Link from "next/link";
import { AssessmentWorkspace } from "@/components/assessment-workspace";
import { Button } from "@/components/ui/button";
import { getVendorAssessmentDetail } from "@/lib/queries/vendor-assessments";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ vendorId: string }>;
};

/**
 * Workspace data uses strict catalogue-based scoring: only COMPLIANT answers earn points;
 * missing or pending rows score 0. `getVendorAssessmentDetail` reconciles `complianceScore` and
 * `riskLevel` in the database before rendering so the header matches the vendor list.
 */
export default async function AssessmentPage({ params }: PageProps) {
  const { vendorId } = await params;
  const detail = await getVendorAssessmentDetail(vendorId);

  if (!detail) {
    return (
      <div className="mx-auto max-w-md space-y-4 rounded-lg border border-slate-200 bg-card p-8 text-center dark:border-slate-800">
        <h1 className="text-lg font-semibold">Vendor not found</h1>
        <p className="text-sm text-muted-foreground">
          This assessment link does not match a vendor in your workspace.
        </p>
        <Button asChild variant="secondary">
          <Link href="/vendors">Return to vendor list</Link>
        </Button>
      </div>
    );
  }

  return (
    <AssessmentWorkspace
      vendorAssessment={detail.vendorAssessment}
      assessmentId={detail.assessmentId}
      initialAnswers={detail.answers}
      documentUrl={detail.documentUrl}
      documentFilename={detail.documentFilename}
      companyId={detail.companyId}
    />
  );
}
