"use client";

import * as React from "react";
import { useTransition } from "react";
import type { RemediationTask, RemediationTaskStatus } from "@prisma/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createRemediationTask, updateRemediationTask } from "@/app/actions/remediation-tasks";
import { toast } from "sonner";

type InternalUser = { id: string; displayName: string | null; email: string | null };

const NO_ASSIGNEE_VALUE = "__none__";

type RemediationTaskFormDialogProps = {
  mode: "create" | "edit";
  assessmentId: string;
  questionId?: string;
  initialValues?: {
    id: string;
    title: string;
    description?: string | null;
    status: RemediationTaskStatus;
    dueDate?: Date | string | null;
    assigneeUserId?: string | null;
  };
  internalUsers: InternalUser[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (task: RemediationTask) => void;
  translations: {
    titleCreate: string;
    titleEdit: string;
    labelTitle: string;
    labelDescription: string;
    labelAssignee: string;
    labelDueDate: string;
    labelStatus: string;
    labelOptional?: string;
    titlePlaceholder?: string;
    descriptionPlaceholder?: string;
    assigneeTooltip?: string;
    submit: string;
    cancel: string;
    errorRequired: string;
    successCreate: string;
    successEdit: string;
    noAssignee: string;
    statusOpen: string;
    statusInProgress: string;
    statusResolved: string;
    statusWontFix: string;
  };
};

export function RemediationTaskFormDialog({
  mode,
  assessmentId,
  questionId,
  initialValues,
  internalUsers,
  open,
  onOpenChange,
  onSuccess,
  translations,
}: RemediationTaskFormDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = React.useState<string | null>(null);

  const [title, setTitle] = React.useState(initialValues?.title ?? "");
  const [description, setDescription] = React.useState(initialValues?.description ?? "");
  const [assigneeUserId, setAssigneeUserId] = React.useState(initialValues?.assigneeUserId ?? "");
  const [status, setStatus] = React.useState<RemediationTaskStatus>(initialValues?.status ?? "OPEN");
  const [dueDate, setDueDate] = React.useState(() => {
    if (!initialValues?.dueDate) return "";
    const d = initialValues.dueDate instanceof Date
      ? initialValues.dueDate
      : new Date(initialValues.dueDate);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString().split("T")[0];
  });

  React.useEffect(() => {
    if (!open) return;

    setTitle(initialValues?.title ?? "");
    setDescription(initialValues?.description ?? "");
    setAssigneeUserId(initialValues?.assigneeUserId ?? "");
    setStatus(initialValues?.status ?? "OPEN");
    setDueDate(() => {
      if (!initialValues?.dueDate) return "";
      const d = initialValues.dueDate instanceof Date
        ? initialValues.dueDate
        : new Date(initialValues.dueDate as string);
      return Number.isNaN(d.getTime()) ? "" : d.toISOString().split("T")[0];
    });
    setFormError(null);
  }, [open, initialValues]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!title.trim()) {
      setFormError(translations.errorRequired);
      return;
    }

    setFormError(null);

    startTransition(async () => {
      if (mode === "create") {
        if (!questionId) {
          setFormError(translations.errorRequired);
          return;
        }

        const result = await createRemediationTask({
          assessmentId,
          questionId,
          title: title.trim(),
          description: description.trim() || null,
          assigneeUserId: assigneeUserId || null,
          dueDate: dueDate ? new Date(dueDate).toISOString() : null,
          status,
        });

        if (result.success && result.data) {
          toast.success(translations.successCreate);
          onSuccess(result.data);
          onOpenChange(false);
        } else {
          setFormError(typeof result.error === "string" ? result.error : translations.errorRequired);
        }
        return;
      }

      if (!initialValues) {
        setFormError(translations.errorRequired);
        return;
      }

      const result = await updateRemediationTask({
        id: initialValues.id,
        title: title.trim(),
        description: description.trim() || null,
        assigneeUserId: assigneeUserId || null,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        status,
      });

      if (result.success && result.data) {
        toast.success(translations.successEdit);
        onSuccess(result.data);
        onOpenChange(false);
      } else {
        setFormError(typeof result.error === "string" ? result.error : translations.errorRequired);
      }
    });
  }

  const dialogTitle = mode === "create" ? translations.titleCreate : translations.titleEdit;
  const assigneeSelectValue = assigneeUserId || NO_ASSIGNEE_VALUE;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription className="sr-only">{dialogTitle}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="rt-title">
              {translations.labelTitle}
              <span aria-hidden="true" className="ml-0.5 text-destructive">*</span>
            </Label>
            <Input
              id="rt-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={translations.titlePlaceholder ?? "Short, actionable description of the gap to close"}
              aria-invalid={!!formError}
              aria-describedby={formError ? "rt-error" : undefined}
              maxLength={255}
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="rt-description">
              {translations.labelDescription}
              <span className="ml-1 text-xs text-muted-foreground font-normal">{translations.labelOptional ?? "(Optional)"}</span>
            </Label>
            <textarea
              id="rt-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={translations.descriptionPlaceholder ?? "Steps to close this gap, evidence needed, or links to relevant policies..."}
              className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              maxLength={2000}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="rt-assignee" className="flex items-center gap-1.5">
              <span>{translations.labelAssignee}</span>
              <InfoTooltip content={translations.assigneeTooltip ?? "Assign to an internal reviewer. The assignee is responsible for verifying remediation."} />
            </Label>
            <Select
              value={assigneeSelectValue}
              onValueChange={(value) => setAssigneeUserId(value === NO_ASSIGNEE_VALUE ? "" : value)}
            >
              <SelectTrigger id="rt-assignee">
                <SelectValue placeholder={translations.noAssignee} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_ASSIGNEE_VALUE}>{translations.noAssignee}</SelectItem>
                {internalUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.displayName ?? u.email ?? u.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="rt-duedate">
              {translations.labelDueDate}
              <span className="ml-1 text-xs text-muted-foreground font-normal">{translations.labelOptional ?? "(Optional)"}</span>
            </Label>
            <Input
              id="rt-duedate"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>

          {mode === "edit" && (
            <div className="grid gap-2">
              <Label htmlFor="rt-status">{translations.labelStatus}</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as RemediationTaskStatus)}>
                <SelectTrigger id="rt-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OPEN">{translations.statusOpen}</SelectItem>
                  <SelectItem value="IN_PROGRESS">{translations.statusInProgress}</SelectItem>
                  <SelectItem value="RESOLVED">{translations.statusResolved}</SelectItem>
                  <SelectItem value="WONT_FIX">{translations.statusWontFix}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {formError && (
            <p id="rt-error" className="text-sm text-destructive" role="alert">
              {formError}
            </p>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              {translations.cancel}
            </Button>
            <Button type="submit" disabled={isPending}>
              {translations.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
