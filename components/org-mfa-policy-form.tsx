"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ShieldAlert, TriangleAlert } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { setOrgMfaRequired } from "@/app/actions/mfa";
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

type OrgMfaPolicyFormProps = {
  mfaRequired: boolean;
  adminHasMfa: boolean;
};

export function OrgMfaPolicyForm({
  mfaRequired,
  adminHasMfa,
}: OrgMfaPolicyFormProps) {
  const t = useTranslations("OrgSecurityPolicy");
  const [isRequired, setIsRequired] = useState(mfaRequired);
  const [isPending, startTransition] = useTransition();
  const [pendingMfaToggle, setPendingMfaToggle] = useState<boolean | null>(null);

  function handleToggle(checked: boolean) {
    // Optimistic update
    setIsRequired(checked);

    startTransition(async () => {
      try {
        await setOrgMfaRequired(checked);
        toast.success(t(checked ? "mfaRequired.enableSuccess" : "mfaRequired.disableSuccess"));
      } catch (err) {
        setIsRequired(!checked); // Revert
        const code = err instanceof Error ? err.message : "UNKNOWN";
        if (code === "ADMIN_MFA_NOT_ENROLLED") {
          toast.error(t("mfaRequired.errorAdminNotEnrolled"));
        } else {
          toast.error(t("mfaRequired.errorSave"));
        }
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert
            className="h-5 w-5 text-[var(--primary)]"
            aria-hidden
          />
          {t("sectionTitle")}
        </CardTitle>
        <CardDescription>{t("sectionDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between rounded-lg border p-4 bg-slate-50/50 dark:bg-slate-900/30">
          <div className="space-y-0.5 max-w-[75%]">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium">{t("mfaRequired.label")}</p>
              <InfoTooltip content={t("mfaRequired.tooltip")} />
            </div>
            <p className="text-xs text-muted-foreground">
              {t("mfaRequired.hint")}
            </p>
          </div>
          <div className="flex items-center gap-4">
            {isRequired ? (
              <Badge
                variant="outline"
                className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800"
              >
                {t("mfaRequired.enabled")}
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800"
              >
                {t("mfaRequired.disabled")}
              </Badge>
            )}
            <Switch
              checked={isRequired}
              onCheckedChange={(newValue) => setPendingMfaToggle(newValue)}
              disabled={isPending || !adminHasMfa}
              aria-label={t("mfaRequired.label")}
            />
          </div>
        </div>

        {!adminHasMfa && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-amber-900 dark:text-amber-200"
          >
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            <p className="text-sm">
              {t("mfaRequired.adminLockoutWarning")}
            </p>
          </div>
        )}

        <AlertDialog
          open={pendingMfaToggle !== null}
          onOpenChange={(open) => {
            if (!open) {
              setPendingMfaToggle(null);
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {pendingMfaToggle
                  ? t("mfaConfirmEnableTitle")
                  : t("mfaConfirmDisableTitle")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {pendingMfaToggle
                  ? t("mfaConfirmEnableDesc")
                  : t("mfaConfirmDisableDesc")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setPendingMfaToggle(null)}>
                {t("mfaConfirmCancel")}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  if (pendingMfaToggle !== null) {
                    handleToggle(pendingMfaToggle);
                  }
                  setPendingMfaToggle(null);
                }}
              >
                {pendingMfaToggle
                  ? t("mfaConfirmEnableAction")
                  : t("mfaConfirmDisableAction")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
