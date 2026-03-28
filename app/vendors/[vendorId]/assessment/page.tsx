import Link from "next/link";
import { AssessmentWorkspace } from "@/components/assessment-workspace";
import { Button } from "@/components/ui/button";
import { getVendorAssessmentByVendorId } from "@/lib/queries/vendor-assessments";

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

  return <AssessmentWorkspace vendorAssessment={vendorAssessment} />;
}
