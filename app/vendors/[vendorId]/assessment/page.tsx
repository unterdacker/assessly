import Link from "next/link";
import { AssessmentWorkspace } from "@/components/assessment-workspace";
import { Button } from "@/components/ui/button";
import { getVendorAssessmentByVendorId } from "@/lib/queries/vendor-assessments";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ vendorId: string }>;
};

export default async function AssessmentPage({ params }: PageProps) {
  const { vendorId } = await params;
  const vendorAssessment = await getVendorAssessmentByVendorId(vendorId);

  if (!vendorAssessment) {
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

  const assessmentRecord = await prisma.assessment.findUnique({
    where: { vendorId },
    select: { id: true, answers: true, documentUrl: true, documentFilename: true },
  });

  return (
    <AssessmentWorkspace
      vendorAssessment={vendorAssessment}
      assessmentId={assessmentRecord?.id!}
      initialAnswers={assessmentRecord?.answers ?? []}
      documentUrl={assessmentRecord?.documentUrl ?? null}
      documentFilename={assessmentRecord?.documentFilename ?? null}
    />
  );
}
