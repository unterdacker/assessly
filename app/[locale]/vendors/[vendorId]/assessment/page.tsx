import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AssessmentWorkspace } from "@/components/assessment-workspace";
import { Button } from "@/components/ui/button";
import { getVendorAssessmentDetail } from "@/lib/queries/vendor-assessments";
import { requirePageRole } from "@/lib/auth/server";
import { getCustomQuestions } from "@/lib/queries/custom-questions";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ locale: string; vendorId: string }>;
};

/**
 * Workspace data uses strict catalogue-based scoring: only COMPLIANT answers earn points;
 * missing or pending rows score 0. `getVendorAssessmentDetail` reconciles `complianceScore` and
 * `riskLevel` in the database before rendering so the header matches the vendor list.
 */
export default async function AssessmentPage({ params }: PageProps) {
  const { locale, vendorId } = await params;
  const session = await requirePageRole(["SUPER_ADMIN", "ADMIN", "RISK_REVIEWER", "AUDITOR"], locale);
  const [detail, customQuestions] = await Promise.all([
    getVendorAssessmentDetail(vendorId),
    session.companyId ? getCustomQuestions(session.companyId) : Promise.resolve([]),
  ]);
  const t = await getTranslations();

  if (!detail) {
    return (
      <div className="mx-auto max-w-md space-y-4 rounded-lg border border-slate-200 bg-card p-8 text-center dark:border-slate-800">
        <h1 className="text-lg font-semibold">{t("assessment.page.notFound.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("assessment.page.notFound.description")}
        </p>
        <Button asChild variant="secondary">
          <Link href={`/${locale}/vendors`}>{t("assessment.page.notFound.returnToVendors")}</Link>
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
      documentFileSize={detail.documentFileSize}
      lastAuditedAt={detail.lastAuditedAt}
      companyId={detail.companyId}
      role={session.role}
      customQuestions={customQuestions}
    />
  );
}
