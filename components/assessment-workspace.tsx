"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import type { RemediationTask, UserRole } from "@prisma/client";
import { ArrowLeft } from "lucide-react";
import type { AssessmentAnswer, Question } from "@prisma/client";
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
import { RemediationTaskFormDialog } from "@/components/remediation-task-form-dialog";
import { deleteRemediationTask } from "@/app/actions/remediation-tasks";
import { ADMIN_ONLY_ROLES, INTERNAL_WRITE_ROLES } from "@/lib/auth/permissions";
import { toast } from "sonner";

type AssessmentWorkspaceProps = {
  vendorAssessment: VendorAssessment;
  assessmentId: string;
  companyId: string;
  initialAnswers: AssessmentAnswer[];
  customQuestions?: Question[];
  templateId?: string | null;
  documentUrl: string | null;
  documentFilename: string | null;
  documentFileSize: number | null;
  lastAuditedAt: string | null;
  role: UserRole;
  initialRemediationTasks?: RemediationTask[];
  internalUsers?: { id: string; displayName: string | null; email: string | null }[];
};

export function AssessmentWorkspace({
  vendorAssessment,
  assessmentId,
  companyId,
  initialAnswers,
  customQuestions,
  templateId,
  documentUrl,
  documentFilename,
  documentFileSize,
  lastAuditedAt,
  role,
  initialRemediationTasks,
  internalUsers,
}: AssessmentWorkspaceProps) {
  const t = useTranslations("assessment.workspace");
  const tRemediations = useTranslations("remediation");
  const locale = useLocale();
  const insightLines = buildVendorAssessmentInsightLines(vendorAssessment);
  const isAdmin = role === "ADMIN";
  const isReadOnly = role !== "ADMIN";
  const canEditRemediation = INTERNAL_WRITE_ROLES.includes(role);
  const canDeleteRemediation = ADMIN_ONLY_ROLES.includes(role);

  // Track selected question for side-by-side view
  const [selectedQuestionId, setSelectedQuestionId] = React.useState<string | null>(null);
  const [remediationTasks, setRemediationTasks] = React.useState<RemediationTask[]>(
    initialRemediationTasks ?? [],
  );
  const [formDialogOpen, setFormDialogOpen] = React.useState(false);
  const [formMode, setFormMode] = React.useState<"create" | "edit">("create");
  const [formTargetQuestionId, setFormTargetQuestionId] = React.useState<string>("");
  const [editingTask, setEditingTask] = React.useState<RemediationTask | null>(null);
  const [isDeletingTaskId, setIsDeletingTaskId] = React.useState<string | null>(null);

  function handleAddTask(questionId: string) {
    setFormMode("create");
    setFormTargetQuestionId(questionId);
    setEditingTask(null);
    setFormDialogOpen(true);
  }

  function handleEditTask(task: RemediationTask) {
    setFormMode("edit");
    setEditingTask(task);
    setFormDialogOpen(true);
  }

  function handleTaskFormSuccess(task: RemediationTask) {
    if (formMode === "create") {
      setRemediationTasks((prev) => [...prev, task]);
      return;
    }

    setRemediationTasks((prev) => prev.map((tItem) => (tItem.id === task.id ? task : tItem)));
  }

  async function handleDeleteTask(taskId: string) {
    if (isDeletingTaskId) return;

    setIsDeletingTaskId(taskId);
    const result = await deleteRemediationTask({ id: taskId });
    setIsDeletingTaskId(null);

    if (result.success) {
      setRemediationTasks((prev) => prev.filter((tItem) => tItem.id !== taskId));
      toast.success(tRemediations("deleteSuccess"));
      return;
    }

    toast.error(typeof result.error === "string" ? result.error : tRemediations("errorGeneric"));
  }

  // PDF upload and AI audit are handled inside PdfUploadZone.

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <Button variant="ghost" size="sm" className="-ml-2 w-fit gap-1" asChild>
            <Link href={`/${locale}/vendors`}>
              <ArrowLeft className="h-4 w-4" aria-hidden />
              {t("backToVendors")}
            </Link>
          </Button>
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
            {vendorAssessment.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("title")} - {vendorAssessment.serviceType}
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
            customQuestions={customQuestions}
            templateId={templateId}
            remediationTasks={remediationTasks}
            canEdit={canEditRemediation}
            canDelete={canDeleteRemediation}
            onAddRemediationTask={canEditRemediation ? handleAddTask : undefined}
            onEditRemediationTask={canEditRemediation ? handleEditTask : undefined}
            onDeleteRemediationTask={canDeleteRemediation ? handleDeleteTask : undefined}
            remediationTranslations={{
              addTask: tRemediations("addTask"),
              tasksLabel: tRemediations("tasks"),
              dueLabel: tRemediations("dueLabel"),
              noDueDate: tRemediations("noDueDate"),
              editLabel: tRemediations("editLabel"),
              deleteLabel: tRemediations("deleteLabel"),
              deleteConfirmTitle: tRemediations("deleteConfirmTitle"),
              deleteConfirmBody: tRemediations("deleteConfirmBody"),
              deleteConfirmAction: tRemediations("deleteConfirmAction"),
              deleteCancelAction: tRemediations("deleteCancelAction"),
              statusOpen: tRemediations("status.OPEN"),
              statusInProgress: tRemediations("status.IN_PROGRESS"),
              statusResolved: tRemediations("status.RESOLVED"),
              statusWontFix: tRemediations("status.WONT_FIX"),
            }}
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

      <RemediationTaskFormDialog
        mode={formMode}
        assessmentId={assessmentId}
        questionId={formTargetQuestionId}
        initialValues={
          editingTask
            ? {
                id: editingTask.id,
                title: editingTask.title,
                description: editingTask.description,
                status: editingTask.status,
                dueDate: editingTask.dueDate,
                assigneeUserId: editingTask.assigneeUserId,
              }
            : undefined
        }
        internalUsers={internalUsers ?? []}
        open={formDialogOpen}
        onOpenChange={setFormDialogOpen}
        onSuccess={handleTaskFormSuccess}
        translations={{
          titleCreate: tRemediations("form.titleCreate"),
          titleEdit: tRemediations("form.titleEdit"),
          labelTitle: tRemediations("form.labelTitle"),
          labelDescription: tRemediations("form.labelDescription"),
          labelAssignee: tRemediations("form.labelAssignee"),
          labelDueDate: tRemediations("form.labelDueDate"),
          labelStatus: tRemediations("form.labelStatus"),
          labelOptional: tRemediations("form.labelOptional"),
          titlePlaceholder: tRemediations("form.titlePlaceholder"),
          descriptionPlaceholder: tRemediations("form.descriptionPlaceholder"),
          assigneeTooltip: tRemediations("form.assigneeTooltip"),
          submit: tRemediations("form.submit"),
          cancel: tRemediations("form.cancel"),
          errorRequired: tRemediations("form.errorRequired"),
          successCreate: tRemediations("form.successCreate"),
          successEdit: tRemediations("form.successEdit"),
          noAssignee: tRemediations("form.noAssignee"),
          statusOpen: tRemediations("status.OPEN"),
          statusInProgress: tRemediations("status.IN_PROGRESS"),
          statusResolved: tRemediations("status.RESOLVED"),
          statusWontFix: tRemediations("status.WONT_FIX"),
        }}
      />
    </div>
  );
}
