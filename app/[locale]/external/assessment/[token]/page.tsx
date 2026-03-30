import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getExternalAssessment } from "@/app/actions/get-external-assessment";
import { ExternalAssessmentWorkspace } from "@/components/external-assessment-workspace";

interface ExternalAssessmentPageProps {
  params: Promise<{
    token: string;
  }>;
}

export const dynamic = "force-dynamic";

/**
 * The secure, no-login entry point for third-party vendors.
 * Validates the token and renders the simplified "External Assessment Workspace".
 */
export default async function ExternalAssessmentPage({ params }: ExternalAssessmentPageProps) {
  const { token } = await params;
  const t = await getTranslations();
  
  const detail = await getExternalAssessment(token);
  
  if (!detail) {
    return notFound();
  }

  if (!detail.isValid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="mx-auto max-w-md space-y-4 rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h1 className="text-xl font-bold text-red-600 dark:text-red-400">{t("LinkInactive")}</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {detail.error || t("LinkExpiredMessage")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <ExternalAssessmentWorkspace 
          vendorAssessment={detail.vendorAssessment}
          assessmentId={detail.assessmentId}
          questions={detail.questions}
          initialAnswers={detail.answers}
          documentUrl={detail.documentUrl}
          documentFilename={detail.documentFilename}
          sessionExpiresAt={detail.sessionExpiresAt}
          token={token}
          translations={{}}
        />
      </div>
    </main>
  );
}
