"use client";

import { useTransition, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { updateCompanyPlan } from "@/app/actions/admin/update-company-plan";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface CompanyPlanToggleProps {
  companyId: string;
  currentPlan: "FREE" | "PREMIUM";
  companyName: string;
}

export function CompanyPlanToggle({ companyId, currentPlan, companyName }: CompanyPlanToggleProps) {
  const t = useTranslations("AdminCompanies");
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isPremium = currentPlan === "PREMIUM";
  const newPlan = isPremium ? "FREE" : "PREMIUM";

  const handleConfirm = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!reason.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await updateCompanyPlan(companyId, newPlan, reason.trim());
      if (!result.success) {
        setError(result.error);
        return;
      }
      setIsOpen(false);
      setReason("");
    });
  };

  return (
    <AlertDialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) {
          setError(null);
          setReason("");
        }
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          variant={isPremium ? "destructive" : "default"}
          size="sm"
          disabled={isPending}
          aria-label={isPremium ? t("downgradeAria", { name: companyName }) : t("upgradeAria", { name: companyName })}
          className={!isPremium ? "bg-amber-600 hover:bg-amber-700 text-white" : ""}
        >
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
          {isPremium ? t("downgradeAction") : t("upgradeAction")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{isPremium ? t("downgradeConfirmTitle") : t("upgradeConfirmTitle")}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              <p>{isPremium ? t("downgradeWarning", { name: companyName }) : t("upgradeMessage", { name: companyName })}</p>
              <div className="mt-4 flex flex-col gap-2">
                <label htmlFor={`reason-${companyId}`} className="text-sm font-medium text-foreground">
                  {t("reasonLabel")} <span className="text-destructive">*</span>
                </label>
                <textarea
                  id={`reason-${companyId}`}
                  required
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={t("reasonPlaceholder")}
                  aria-required="true"
                  disabled={isPending}
                />
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>{t("cancel")}</AlertDialogCancel>
          <Button
            variant={isPremium ? "destructive" : "default"}
            onClick={handleConfirm}
            disabled={isPending || !reason.trim()}
            className={!isPremium ? "bg-amber-600 hover:bg-amber-700 text-white" : ""}
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isPremium ? t("confirmDowngrade") : t("confirmUpgrade")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}