import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AssessmentWorkspace } from "@/components/assessment-workspace";
import { RecurrenceBadge } from "@/components/recurrence-badge";
import { RecurrenceScheduleForm } from "@/components/recurrence-schedule-form";
import { ManualReassessmentButton } from "@/components/manual-reassessment-button";
import { RegressionAlertBanner } from "@/components/regression-alert-banner";
import { Button } from "@/components/ui/button";
import { getVendorAssessmentDetail } from "@/lib/queries/vendor-assessments";
import { requirePageRole } from "@/lib/auth/server";
import { getCustomQuestions } from "@/lib/queries/custom-questions";
import {
  listInternalUsersForCompany,
  listRemediationTasksByAssessmentId,
} from "@/lib/queries/remediation-tasks";
import { ApprovalWorkflowPanel } from "@/modules/approval-workflow/components/approval-workflow-panel";
import { OverdueBadge } from "@/modules/sla-tracking/components/overdue-badge";
import { DueDatePicker } from "@/modules/sla-tracking/components/due-date-picker";
import { ManualReminderButton } from "@/modules/sla-tracking/components/manual-reminder-button";
import { getRegressionAlerts } from "@/modules/continuous-monitoring/actions/schedule-actions";
import { isPremiumFeatureEnabled } from "@/lib/enterprise-bridge";
import { prisma } from "@/lib/prisma";

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
  const session = await requirePageRole(["ADMIN", "RISK_REVIEWER", "AUDITOR"], locale);
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

  const isPremium = await isPremiumFeatureEnabled(session.companyId ?? "");

  // Fetch recurrence schedule for this vendor
  const schedule = await prisma.recurrenceSchedule.findUnique({
    where: {
      vendorId_companyId: {
        vendorId,
        companyId: session.companyId ?? "",
      },
    },
    include: {
      template: {
        select: { id: true, name: true },
      },
    },
  });

  // Fetch templates for the form
  const templates = await prisma.questionnaireTemplate.findMany({
    where: { companyId: session.companyId ?? "" },
    select: { id: true, name: true },
  });

  // Fetch regression alerts for Premium users
  let regressionData: Array<{ category: string; fromScore: number; toScore: number; delta: number }> = [];
  if (isPremium) {
    const regressionResult = await getRegressionAlerts({ vendorId });
    if (regressionResult.success) {
      // Extract regression data from audit log metadata
      regressionData = regressionResult.data
        .map((alert) => {
          const regressions = alert.metadata?.regressions as Array<{
            category: string;
            fromScore: number;
            toScore: number;
            delta: number;
          }> | undefined;
          return regressions ?? [];
        })
        .flat();
    }
  }

  const [initialRemediationTasks, internalUsers] = await Promise.all([
    listRemediationTasksByAssessmentId(detail.assessmentId, detail.companyId),
    listInternalUsersForCompany(detail.companyId),
  ]);

  // Continuous monitoring translations
  const cmTranslations = {
    badge: {
      monthly: t("ContinuousMonitoring.intervalMonthly"),
      quarterly: t("ContinuousMonitoring.intervalQuarterly"),
      semiAnnual: t("ContinuousMonitoring.intervalSemiAnnual"),
      annual: t("ContinuousMonitoring.intervalAnnual"),
      daysUntilDue: t("ContinuousMonitoring.badge.daysUntilDue"),
      daysOverdue: t("ContinuousMonitoring.badge.daysOverdue"),
    },
    form: {
      title: t("ContinuousMonitoring.form.title"),
      editTitle: t("ContinuousMonitoring.form.titleEdit"),
      intervalLabel: t("ContinuousMonitoring.form.intervalLabel"),
      monthly: t("ContinuousMonitoring.intervalMonthly"),
      quarterly: t("ContinuousMonitoring.intervalQuarterly"),
      semiAnnual: t("ContinuousMonitoring.intervalSemiAnnual"),
      annual: t("ContinuousMonitoring.intervalAnnual"),
      templateLabel: t("ContinuousMonitoring.form.templateLabel"),
      noTemplate: t("ContinuousMonitoring.form.templateNone"),
      autoSendLabel: t("ContinuousMonitoring.form.autoSendLabel"),
      autoSendHint: t("ContinuousMonitoring.form.autoSendHint"),
      regressionThresholdLabel: t("ContinuousMonitoring.form.regressionThresholdLabel"),
      regressionThresholdHint: t("ContinuousMonitoring.form.regressionThresholdHint"),
      submitCreate: t("ContinuousMonitoring.form.submitCreate"),
      submitUpdate: t("ContinuousMonitoring.form.submitUpdate"),
      cancel: t("ContinuousMonitoring.form.cancel"),
      successCreate: t("ContinuousMonitoring.form.successCreate"),
      successUpdate: t("ContinuousMonitoring.form.successUpdate"),
      errorDuplicate: t("ContinuousMonitoring.form.errorDuplicate"),
      errorPremiumRequired: t("ContinuousMonitoring.form.errorPremiumRequired"),
      errorRateLimit: t("ContinuousMonitoring.form.errorRateLimit"),
      premiumLabel: t("ContinuousMonitoring.form.premiumLabel"),
      premiumRequired: t("ContinuousMonitoring.form.premiumRequired"),
      submit: t("ContinuousMonitoring.form.submitCreate"),
      error: t("ContinuousMonitoring.manualReassessment.error"),
    },
    manualReassessment: {
      buttonLabel: t("ContinuousMonitoring.manualReassessment.button"),
      dialogTitle: t("ContinuousMonitoring.manualReassessment.dialogTitle"),
      dialogDescription: t("ContinuousMonitoring.manualReassessment.dialogDescription"),
      confirm: t("ContinuousMonitoring.manualReassessment.confirm"),
      cancel: t("ContinuousMonitoring.manualReassessment.cancel"),
      success: t("ContinuousMonitoring.manualReassessment.success"),
      error: t("ContinuousMonitoring.manualReassessment.error"),
      rateLimit: t("ContinuousMonitoring.manualReassessment.rateLimit"),
    },
    regressionAlert: {
      title: t("ContinuousMonitoring.regressionAlert.title"),
      message: t("ContinuousMonitoring.regressionAlert.message"),
      dismiss: t("ContinuousMonitoring.regressionAlert.dismiss"),
      category: t("ContinuousMonitoring.regressionAlert.category"),
    },
  };

  return (
    <>
      <div className="mx-auto max-w-screen-xl px-4 sm:px-6 lg:px-8 mb-4 flex items-center gap-3 flex-wrap">
        <OverdueBadge dueDate={detail.vendorAssessment.dueDate} />
        {schedule && (
          <RecurrenceBadge
            interval={schedule.interval}
            nextDueAt={schedule.nextDueAt}
            translations={cmTranslations.badge}
          />
        )}
        {(session.role === "ADMIN" ||
          session.role === "RISK_REVIEWER") && (
          <>
            <DueDatePicker
              assessmentId={detail.assessmentId}
              initialDueDate={detail.vendorAssessment.dueDate}
            />
            <ManualReminderButton assessmentId={detail.assessmentId} />
            {schedule && (
              <ManualReassessmentButton
                scheduleId={schedule.id}
                vendorName={detail.vendorAssessment.name}
                translations={cmTranslations.manualReassessment}
              />
            )}
          </>
        )}
      </div>

      {/* Regression alert banner */}
      {isPremium && regressionData.length > 0 && (
        <div className="mx-auto max-w-screen-xl px-4 sm:px-6 lg:px-8 mb-4">
          <RegressionAlertBanner
            regressions={regressionData}
            vendorId={vendorId}
            onDismiss={() => {}}
            translations={cmTranslations.regressionAlert}
          />
        </div>
      )}

      {/* Recurrence schedule form */}
      <div className="mx-auto max-w-screen-xl px-4 sm:px-6 lg:px-8 mb-6">
        <RecurrenceScheduleForm
          vendorId={vendorId}
          schedule={schedule ? {
            id: schedule.id,
            interval: schedule.interval,
            templateId: schedule.templateId,
            autoSend: schedule.autoSend,
            regressionThreshold: schedule.regressionThreshold,
          } : undefined}
          templates={templates}
          isPremium={isPremium}
          translations={cmTranslations.form}
        />
      </div>

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
        initialRemediationTasks={initialRemediationTasks}
        internalUsers={internalUsers}
      />
      <div className="mx-auto mt-6 max-w-screen-xl px-4 sm:px-6 lg:px-8">
        <ApprovalWorkflowPanel
          assessmentId={detail.assessmentId}
          companyId={detail.companyId}
          role={session.role}
        />
      </div>
    </>
  );
}
