"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { triggerManualReassessment } from "@/modules/continuous-monitoring/actions/schedule-actions";
import { toast } from "sonner";

type ManualReassessmentButtonProps = {
  scheduleId: string;
  vendorName: string;
  disabled?: boolean;
  translations: {
    buttonLabel: string;
    dialogTitle: string;
    dialogDescription: string;
    confirm: string;
    cancel: string;
    success: string;
    error: string;
    rateLimit: string;
  };
  onSuccess?: () => void;
};

export function ManualReassessmentButton({
  scheduleId,
  vendorName,
  disabled = false,
  translations,
  onSuccess,
}: ManualReassessmentButtonProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      try {
        const result = await triggerManualReassessment(scheduleId);
        
        if (result.success) {
          toast.success(translations.success);
          onSuccess?.();
          setOpen(false);
        } else {
          if (result.error?.includes("Rate limit")) {
            toast.error(translations.rateLimit);
          } else {
            toast.error(translations.error);
          }
        }
      } catch {
        toast.error(translations.error);
      }
    });
  }

  const interpolatedDescription = translations.dialogDescription.replace(
    "{vendorName}",
    vendorName
  );

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled || isPending}>
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
          {translations.buttonLabel}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{translations.dialogTitle}</AlertDialogTitle>
          <AlertDialogDescription>{interpolatedDescription}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>
            {translations.cancel}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            onClick={(e) => {
              e.preventDefault();
              handleConfirm();
            }}
          >
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
            {translations.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
