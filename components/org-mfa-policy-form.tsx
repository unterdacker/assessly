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
import { setOrgMfaRequired } from "@/app/actions/mfa";

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
            className="h-5 w-5 text-indigo-600 dark:text-indigo-400"
            aria-hidden
          />
          {t("sectionTitle")}
        </CardTitle>
        <CardDescription>{t("sectionDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between rounded-lg border p-4 bg-slate-50/50 dark:bg-slate-900/30">
          <div className="space-y-0.5 max-w-[75%]">
            <p className="text-sm font-medium">{t("mfaRequired.label")}</p>
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
              onCheckedChange={handleToggle}
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
      </CardContent>
    </Card>
  );
}
