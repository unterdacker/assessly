"use client";

import * as React from "react";
import type { RemediationTask, RemediationTaskStatus } from "@prisma/client";
import { Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const statusVariant: Record<RemediationTaskStatus, "high" | "medium" | "low" | "outline"> = {
  OPEN: "high",
  IN_PROGRESS: "medium",
  RESOLVED: "low",
  WONT_FIX: "outline",
};

export type RemediationTaskInlineListTranslations = {
  tasksLabel: string;
  dueLabel: string;
  noDueDate: string;
  editLabel: string;
  deleteLabel: string;
  deleteConfirmTitle: string;
  deleteConfirmBody: string;
  deleteConfirmAction: string;
  deleteCancelAction: string;
  statusOpen: string;
  statusInProgress: string;
  statusResolved: string;
  statusWontFix: string;
};

type RemediationTaskInlineListProps = {
  tasks: RemediationTask[];
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (task: RemediationTask) => void;
  onDelete: (taskId: string) => void;
  translations: RemediationTaskInlineListTranslations;
};

const statusLabels: Record<RemediationTaskStatus, keyof RemediationTaskInlineListTranslations> = {
  OPEN: "statusOpen",
  IN_PROGRESS: "statusInProgress",
  RESOLVED: "statusResolved",
  WONT_FIX: "statusWontFix",
};

export function RemediationTaskInlineList({
  tasks,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
  translations,
}: RemediationTaskInlineListProps) {
  const [pendingDeleteId, setPendingDeleteId] = React.useState<string | null>(null);

  if (tasks.length === 0) return null;

  return (
    <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
      <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {translations.tasksLabel}
      </h4>
      <ul className="space-y-1">
        {tasks.map((task) => {
          const statusLabel = translations[statusLabels[task.status]];
          const dueDateText = task.dueDate
            ? `${translations.dueLabel}: ${new Date(task.dueDate).toLocaleDateString()}`
            : translations.noDueDate;

          return (
            <li
              key={task.id}
              className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm transition-colors hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800/80"
            >
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                <Badge variant={statusVariant[task.status]}>
                  <span className="sr-only">Status: </span>
                  {statusLabel}
                </Badge>
                <span className="font-medium text-slate-900 dark:text-slate-100">{task.title}</span>
                <span className="text-xs text-muted-foreground">{dueDateText}</span>
              </div>
              <div className="flex items-center gap-1">
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onEdit(task)}
                    aria-label={`${translations.editLabel}: ${task.title}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                )}
                {canDelete && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPendingDeleteId(task.id)}
                    className="text-destructive hover:text-destructive"
                    aria-label={`${translations.deleteLabel}: ${task.title}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <AlertDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDeleteId(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{translations.deleteConfirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDeleteId && tasks.find((task) => task.id === pendingDeleteId)?.title && (
                <span className="mb-1 block font-medium text-foreground">
                  &ldquo;{tasks.find((task) => task.id === pendingDeleteId)?.title}&rdquo;
                </span>
              )}
              {translations.deleteConfirmBody}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingDeleteId(null)}>
              {translations.deleteCancelAction}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDeleteId) {
                  onDelete(pendingDeleteId);
                  setPendingDeleteId(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {translations.deleteConfirmAction}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
