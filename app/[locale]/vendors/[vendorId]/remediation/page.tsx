import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { VendorRemediationTaskList } from "@/components/vendor-remediation-task-list";
import { requireInternalReadUser } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";
import {
  listInternalUsersForCompany,
  listRemediationTasksByAssessmentId,
} from "@/lib/queries/remediation-tasks";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string; vendorId: string }>;
};

export default async function VendorRemediationPage({ params }: Props) {
  const { locale, vendorId } = await params;
  setRequestLocale(locale);

  const session = await requireInternalReadUser();
  if (!session.companyId) redirect(`/${locale}/dashboard`);

  const t = await getTranslations({ locale, namespace: "remediation" });

  const assessment = await prisma.assessment.findFirst({
    where: { vendorId, companyId: session.companyId },
    select: { id: true, vendor: { select: { name: true } } },
  });

  if (!assessment) {
    return <div className="p-8 text-center text-muted-foreground">{t("noAssessmentFound")}</div>;
  }

  const [tasks, internalUsers] = await Promise.all([
    listRemediationTasksByAssessmentId(assessment.id, session.companyId),
    listInternalUsersForCompany(session.companyId),
  ]);

  return (
    <VendorRemediationTaskList
      initialTasks={tasks}
      vendorName={assessment.vendor.name}
      assessmentId={assessment.id}
      role={session.role}
      internalUsers={internalUsers}
      translations={{
        pageTitle: t("tasks"),
        tasksForVendor: t("tasksForVendor", { vendorName: assessment.vendor.name }),
        noTasks: t("noTasks"),
        pageDescription: t("pageDescription"),
        sortByDueDate: t("sortByDueDate"),
        sortByStatus: t("sortByStatus"),
        dueLabel: t("dueLabel"),
        noDueDate: t("noDueDate"),
        editLabel: t("editLabel"),
        deleteLabel: t("deleteLabel"),
        statusOpen: t("status.OPEN"),
        statusInProgress: t("status.IN_PROGRESS"),
        statusResolved: t("status.RESOLVED"),
        statusWontFix: t("status.WONT_FIX"),
        form: {
          titleCreate: t("form.titleCreate"),
          titleEdit: t("form.titleEdit"),
          labelTitle: t("form.labelTitle"),
          labelDescription: t("form.labelDescription"),
          labelAssignee: t("form.labelAssignee"),
          labelDueDate: t("form.labelDueDate"),
          labelStatus: t("form.labelStatus"),
          submit: t("form.submit"),
          cancel: t("form.cancel"),
          errorRequired: t("form.errorRequired"),
          successCreate: t("form.successCreate"),
          successEdit: t("form.successEdit"),
          noAssignee: t("form.noAssignee"),
        },
        tasksLabel: t("tasks"),
        addTask: t("addTask"),
        deleteSuccess: t("deleteSuccess"),
        errorGeneric: t("errorGeneric"),
      }}
    />
  );
}
