"use client";

import * as React from "react";
import type { RemediationTask, RemediationTaskStatus, UserRole } from "@prisma/client";
import { ArrowUpDown } from "lucide-react";
import { toast } from "sonner";
import { deleteRemediationTask } from "@/app/actions/remediation-tasks";
import { RemediationTaskFormDialog } from "@/components/remediation-task-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ADMIN_ONLY_ROLES, INTERNAL_WRITE_ROLES } from "@/lib/auth/permissions";

const statusVariant: Record<RemediationTaskStatus, "high" | "medium" | "low" | "outline"> = {
  OPEN: "high",
  IN_PROGRESS: "medium",
  RESOLVED: "low",
  WONT_FIX: "outline",
};

const STATUS_ORDER: Record<RemediationTaskStatus, number> = {
  OPEN: 0,
  IN_PROGRESS: 1,
  RESOLVED: 2,
  WONT_FIX: 3,
};

type InternalUser = { id: string; displayName: string | null; email: string | null };

type Translations = {
  pageTitle: string;
  tasksForVendor: string;
  noTasks: string;
  pageDescription: string;
  sortByDueDate: string;
  sortByStatus: string;
  dueLabel: string;
  noDueDate: string;
  editLabel: string;
  deleteLabel: string;
  statusOpen: string;
  statusInProgress: string;
  statusResolved: string;
  statusWontFix: string;
  tasksLabel: string;
  addTask: string;
  deleteSuccess: string;
  errorGeneric: string;
  form: {
    titleCreate: string;
    titleEdit: string;
    labelTitle: string;
    labelDescription: string;
    labelAssignee: string;
    labelDueDate: string;
    labelStatus: string;
    submit: string;
    cancel: string;
    errorRequired: string;
    successCreate: string;
    successEdit: string;
    noAssignee: string;
  };
};

type Props = {
  initialTasks: RemediationTask[];
  vendorName: string;
  assessmentId: string;
  role: UserRole;
  internalUsers: InternalUser[];
  translations: Translations;
};

type SortKey = "dueDate" | "status";

export function VendorRemediationTaskList({
  initialTasks,
  vendorName,
  assessmentId,
  role,
  internalUsers,
  translations,
}: Props) {
  const [tasks, setTasks] = React.useState(initialTasks);
  const [sortKey, setSortKey] = React.useState<SortKey>("dueDate");
  const [editingTask, setEditingTask] = React.useState<RemediationTask | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);

  const canEdit = INTERNAL_WRITE_ROLES.includes(role);
  const canDelete = ADMIN_ONLY_ROLES.includes(role);

  const sortedTasks = React.useMemo(() => {
    return [...tasks].sort((a, b) => {
      if (sortKey === "status") {
        return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      }

      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });
  }, [tasks, sortKey]);

  function handleEdit(task: RemediationTask) {
    setEditingTask(task);
    setFormOpen(true);
  }

  async function handleDelete(taskId: string) {
    const result = await deleteRemediationTask({ id: taskId });
    if (result.success) {
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      toast.success(translations.deleteSuccess);
    } else {
      toast.error(typeof result.error === "string" ? result.error : translations.errorGeneric);
    }
  }

  function handleFormSuccess(task: RemediationTask) {
    setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
  }

  const statusLabelMap: Record<RemediationTaskStatus, string> = {
    OPEN: translations.statusOpen,
    IN_PROGRESS: translations.statusInProgress,
    RESOLVED: translations.statusResolved,
    WONT_FIX: translations.statusWontFix,
  };

  return (
    <div className="space-y-6 p-4 md:p-6" aria-label={`${translations.tasksLabel}: ${vendorName}`}>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{translations.tasksForVendor}</h1>
          <p className="text-sm text-muted-foreground">{translations.pageDescription}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setSortKey("dueDate")}
            aria-pressed={sortKey === "dueDate"}
          >
            <ArrowUpDown className="h-4 w-4" />
            {translations.sortByDueDate}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setSortKey("status")}
            aria-pressed={sortKey === "status"}
          >
            <ArrowUpDown className="h-4 w-4" />
            {translations.sortByStatus}
          </Button>
        </div>
      </header>

      {sortedTasks.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">{translations.noTasks}</p>
      ) : (
        <ul className="space-y-2">
          {sortedTasks.map((task) => {
            const dueDateText = task.dueDate
              ? `${translations.dueLabel}: ${new Date(task.dueDate).toLocaleDateString()}`
              : translations.noDueDate;
            const statusLabel = statusLabelMap[task.status];

            return (
              <li
                key={task.id}
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950"
              >
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
                  <Badge variant={statusVariant[task.status]}>
                    <span className="sr-only">Status: </span>
                    {statusLabel}
                  </Badge>
                  <span className="font-medium">{task.title}</span>
                  <span className="text-xs text-muted-foreground">{dueDateText}</span>
                </div>
                <div className="flex items-center gap-2">
                  {canEdit && (
                    <Button variant="outline" size="sm" onClick={() => handleEdit(task)}>
                      {translations.editLabel}
                    </Button>
                  )}
                  {canDelete && (
                    <Button variant="destructive" size="sm" onClick={() => handleDelete(task.id)}>
                      {translations.deleteLabel}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editingTask && (
        <RemediationTaskFormDialog
          mode="edit"
          assessmentId={assessmentId}
          initialValues={{
            id: editingTask.id,
            title: editingTask.title,
            description: editingTask.description,
            status: editingTask.status,
            dueDate: editingTask.dueDate,
            assigneeUserId: editingTask.assigneeUserId,
          }}
          internalUsers={internalUsers}
          open={formOpen}
          onOpenChange={setFormOpen}
          onSuccess={handleFormSuccess}
          translations={{
            ...translations.form,
            statusOpen: translations.statusOpen,
            statusInProgress: translations.statusInProgress,
            statusResolved: translations.statusResolved,
            statusWontFix: translations.statusWontFix,
          }}
        />
      )}
    </div>
  );
}
