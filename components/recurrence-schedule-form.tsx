"use client";

import { useState, useActionState } from "react";
import { Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { createRecurrenceSchedule, updateRecurrenceSchedule } from "@/modules/continuous-monitoring/actions/schedule-actions";
import { toast } from "sonner";

type ScheduleListItem = {
  id: string;
  interval: "MONTHLY" | "QUARTERLY" | "SEMI_ANNUAL" | "ANNUAL";
  templateId?: string;
  autoSend: boolean;
  regressionThreshold: number;
};

type RecurrenceFormTranslations = {
  title: string;
  editTitle: string;
  intervalLabel: string;
  monthly: string;
  quarterly: string;
  semiAnnual: string;
  annual: string;
  templateLabel: string;
  noTemplate: string;
  autoSendLabel: string;
  autoSendHint: string;
  regressionThresholdLabel: string;
  regressionThresholdHint: string;
  premiumLabel: string;
  premiumRequired: string;
  submitCreate: string;
  submitUpdate: string;
  cancel: string;
  successCreate: string;
  successUpdate: string;
  error: string;
  errorPremiumRequired: string;
  errorRateLimit: string;
  errorDuplicate: string;
};

type RecurrenceScheduleFormProps = {
  vendorId: string;
  schedule?: ScheduleListItem;
  templates: Array<{ id: string; name: string }>;
  isPremium: boolean;
  translations: RecurrenceFormTranslations;
  onSuccess?: () => void;
};

export function RecurrenceScheduleForm({
  vendorId,
  schedule,
  templates,
  isPremium,
  translations,
  onSuccess,
}: RecurrenceScheduleFormProps) {
  const [interval, setInterval] = useState<ScheduleListItem["interval"]>(
    schedule?.interval ?? "QUARTERLY"
  );
  const [templateId, setTemplateId] = useState<string>(schedule?.templateId ?? "");
  const [autoSend, setAutoSend] = useState(schedule?.autoSend ?? false);
  const [regressionThreshold, setRegressionThreshold] = useState(
    schedule?.regressionThreshold ?? 10
  );

  const isEditMode = Boolean(schedule);

  // Server action state
  const [, formAction, isPending] = useActionState(
    async (_prevState: unknown, formData: FormData) => {
      const data = {
        interval: formData.get("interval") as ScheduleListItem["interval"],
        templateId: formData.get("templateId") as string | null,
        autoSend: formData.get("autoSend") === "true",
        regressionThreshold: Number(formData.get("regressionThreshold")),
        isActive: true,
      };

      let result;
      if (isEditMode && schedule) {
        result = await updateRecurrenceSchedule(schedule.id, data);
      } else {
        result = await createRecurrenceSchedule(vendorId, data);
      }

      if (result.success) {
        toast.success(isEditMode ? translations.successUpdate : translations.successCreate);
        onSuccess?.();
      } else {
        // Handle specific error codes
        if (result.error === "PREMIUM_REQUIRED") {
          toast.error(translations.errorPremiumRequired);
        } else if (result.error === "Rate limit exceeded. Please try again later.") {
          toast.error(translations.errorRateLimit);
        } else if (result.error?.includes("already exists")) {
          toast.error(translations.errorDuplicate);
        } else {
          toast.error(result.error ?? translations.error);
        }
      }

      return result;
    },
    null
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    formAction(formData);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          {isEditMode ? translations.editTitle : translations.title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Hidden fields for form submission */}
          <input type="hidden" name="interval" value={interval} />
          <input type="hidden" name="templateId" value={templateId || ""} />
          <input type="hidden" name="autoSend" value={String(autoSend)} />
          <input type="hidden" name="regressionThreshold" value={regressionThreshold} />

          {/* Interval Radio Group */}
          <div className="space-y-3">
            <Label htmlFor="interval" className="text-sm font-medium">
              {translations.intervalLabel}
            </Label>
            <RadioGroup
              id="interval"
              value={interval}
              onValueChange={(value) => setInterval(value as ScheduleListItem["interval"])}
              className="grid grid-cols-2 gap-3 sm:grid-cols-4"
            >
              <label
                className={`flex cursor-pointer items-center justify-center rounded-lg border-2 px-4 py-3 text-sm font-medium transition-colors hover:bg-muted ${
                  interval === "MONTHLY"
                    ? "border-primary bg-primary/5"
                    : "border-border"
                }`}
              >
                <input
                  type="radio"
                  value="MONTHLY"
                  checked={interval === "MONTHLY"}
                  onChange={() => setInterval("MONTHLY")}
                  className="sr-only"
                />
                {translations.monthly}
              </label>
              <label
                className={`flex cursor-pointer items-center justify-center rounded-lg border-2 px-4 py-3 text-sm font-medium transition-colors hover:bg-muted ${
                  interval === "QUARTERLY"
                    ? "border-primary bg-primary/5"
                    : "border-border"
                }`}
              >
                <input
                  type="radio"
                  value="QUARTERLY"
                  checked={interval === "QUARTERLY"}
                  onChange={() => setInterval("QUARTERLY")}
                  className="sr-only"
                />
                {translations.quarterly}
              </label>
              <label
                className={`flex cursor-pointer items-center justify-center rounded-lg border-2 px-4 py-3 text-sm font-medium transition-colors hover:bg-muted ${
                  interval === "SEMI_ANNUAL"
                    ? "border-primary bg-primary/5"
                    : "border-border"
                }`}
              >
                <input
                  type="radio"
                  value="SEMI_ANNUAL"
                  checked={interval === "SEMI_ANNUAL"}
                  onChange={() => setInterval("SEMI_ANNUAL")}
                  className="sr-only"
                />
                {translations.semiAnnual}
              </label>
              <label
                className={`flex cursor-pointer items-center justify-center rounded-lg border-2 px-4 py-3 text-sm font-medium transition-colors hover:bg-muted ${
                  interval === "ANNUAL"
                    ? "border-primary bg-primary/5"
                    : "border-border"
                }`}
              >
                <input
                  type="radio"
                  value="ANNUAL"
                  checked={interval === "ANNUAL"}
                  onChange={() => setInterval("ANNUAL")}
                  className="sr-only"
                />
                {translations.annual}
              </label>
            </RadioGroup>
          </div>

          {/* Template Picker */}
          <div className="space-y-2">
            <Label htmlFor="template" className="text-sm font-medium">
              {translations.templateLabel}
            </Label>
            <select
              id="template"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">{translations.noTemplate}</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </div>

          {/* AutoSend Checkbox (Premium) */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label
                htmlFor="autoSend"
                className={`text-sm font-medium ${!isPremium ? "text-muted-foreground" : ""}`}
              >
                {translations.autoSendLabel}
              </Label>
              {!isPremium && (
                <>
                  <Lock className="h-4 w-4 text-amber-500" aria-hidden />
                  <Badge
                    variant="outline"
                    className="border-amber-300 bg-amber-100 text-amber-700 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
                  >
                    {translations.premiumLabel}
                  </Badge>
                </>
              )}
            </div>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="autoSend"
                checked={autoSend}
                onChange={(e) => setAutoSend(e.target.checked)}
                disabled={!isPremium}
                aria-disabled={!isPremium}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <p className="text-sm text-muted-foreground">{translations.autoSendHint}</p>
              {!isPremium && (
                <span className="sr-only">{translations.premiumRequired}</span>
              )}
            </div>
          </div>

          {/* Regression Threshold (Premium) */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label
                htmlFor="regressionThreshold"
                className={`text-sm font-medium ${!isPremium ? "text-muted-foreground" : ""}`}
              >
                {translations.regressionThresholdLabel}
              </Label>
              {!isPremium && (
                <>
                  <Lock className="h-4 w-4 text-amber-500" aria-hidden />
                  <Badge
                    variant="outline"
                    className="border-amber-300 bg-amber-100 text-amber-700 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
                  >
                    {translations.premiumLabel}
                  </Badge>
                </>
              )}
            </div>
            <Input
              type="number"
              id="regressionThreshold"
              min={1}
              max={100}
              value={regressionThreshold}
              onChange={(e) => setRegressionThreshold(Number(e.target.value))}
              disabled={!isPremium}
              aria-disabled={!isPremium}
              className="w-32"
            />
            <p className="text-sm text-muted-foreground">
              {translations.regressionThresholdHint}
            </p>
            {!isPremium && (
              <span className="sr-only">{translations.premiumRequired}</span>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <Button type="submit" disabled={isPending}>
              {isPending ? "..." : (isEditMode ? translations.submitUpdate : translations.submitCreate)}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => onSuccess?.()}
              disabled={isPending}
            >
              {translations.cancel}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
