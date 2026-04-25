"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Sparkles, Globe, Server, Ban, AlertCircle, CheckCircle2 } from "lucide-react";
import { updateAiSettings } from "@/app/actions/update-settings";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
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

interface Company {
  id: string;
  aiProvider: string;
  aiDisabled: boolean;
  mistralApiKey: string | null;
  localAiEndpoint: string | null;
  localAiModel: string | null;
}

interface Translations {
  AIProviderConfiguration: string;
  SelectAIProvider: string;
  MistralAI: string;
  LocalServer: string;
  MistralAPIKey: string;
  mistralApiKeyHint?: string;
  KeyAlreadyConfigured: string;
  EnterMistralAPIKey: string;
  LocalAIEndpoint: string;
  LocalAIEndpointPlaceholder: string;
  LocalAIModel: string;
  LocalAIModelPlaceholder: string;
  SaveConfiguration: string;
  SettingsUpdatedSuccess: string;
  noAiMode: string;
  noAiModeDesc: string;
  noAiConfirmTitle: string;
  noAiConfirmCancel: string;
  noAiConfirmAction: string;
  noAiConfirmMessage: string;
  aiFeaturesDisabled: string;
  aiFeaturesDisabledDesc: string;
  aiDisabledBadge: string;
}

export function AiSettingsForm({ company, companyId, translations }: { company: Company; companyId: string; translations: Translations }) {
  const router = useRouter();
  const [aiProvider, setAiProvider] = useState(company.aiDisabled ? "no-ai" : company.aiProvider);
  const [isDirty, setIsDirty] = useState(false);
  const [showNoAiConfirm, setShowNoAiConfirm] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const [state, formAction] = useActionState(updateAiSettings, null);

  useEffect(() => {
    if (state?.success) {
      setIsDirty(false);
      router.refresh();
    }
  }, [state, router]);

  useEffect(() => {
    if (!isDirty) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-[var(--primary)]" />
          {translations.AIProviderConfiguration}
        </CardTitle>
        <CardDescription>
          {translations.SelectAIProvider}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={formRef} action={formAction} className="space-y-6" onSubmit={(e) => {
          if (
            !company.aiDisabled &&
            aiProvider === "no-ai" &&
            !showNoAiConfirm
          ) {
            e.preventDefault();
            setShowNoAiConfirm(true);
            return;
          }
        }}>
          <input type="hidden" name="companyId" value={companyId} />
          <input type="hidden" name="aiProvider" value={aiProvider} />

          {aiProvider === "no-ai" && (
            <div className="rounded-lg border border-warning-border bg-warning-muted px-3 py-2 text-warning-muted-fg">
              <p className="text-xs font-semibold uppercase tracking-wide">{translations.aiDisabledBadge}</p>
              <p className="text-sm font-medium">{translations.aiFeaturesDisabled}</p>
              <p className="text-xs text-warning-muted-fg">{translations.aiFeaturesDisabledDesc}</p>
            </div>
          )}

          <RadioGroup
            value={aiProvider}
            onValueChange={(value) => {
              setAiProvider(value);
              setIsDirty(true);
            }}
            className="space-y-3"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="no-ai" id="no-ai" />
              <Label htmlFor="no-ai" className="flex items-center gap-2 cursor-pointer text-sm font-medium">
                <Ban className="h-4 w-4" />
                {translations.noAiMode}
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="mistral" id="mistral" />
              <Label htmlFor="mistral" className="flex items-center gap-2 cursor-pointer text-sm font-medium">
                <Globe className="h-4 w-4" />
                {translations.MistralAI}
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="local" id="local" />
              <Label htmlFor="local" className="flex items-center gap-2 cursor-pointer text-sm font-medium">
                <Server className="h-4 w-4" />
                {translations.LocalServer}
              </Label>
            </div>
          </RadioGroup>

          {aiProvider === "mistral" && (
            <div className="space-y-2">
              <Label htmlFor="mistralApiKey">{translations.MistralAPIKey}</Label>
              <Input
                id="mistralApiKey"
                name="mistralApiKey"
                type="password"
                placeholder={
                  company.mistralApiKey === ""
                    ? translations.KeyAlreadyConfigured
                    : translations.EnterMistralAPIKey
                }
                defaultValue=""
                onChange={() => setIsDirty(true)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {translations.mistralApiKeyHint ?? "This key routes AI analysis to Mistral's EU cloud. Leave blank to keep the existing key."}
              </p>
            </div>
          )}

          {aiProvider === "local" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="localAiEndpoint">{translations.LocalAIEndpoint}</Label>
                <Input
                  id="localAiEndpoint"
                  name="localAiEndpoint"
                  placeholder={translations.LocalAIEndpointPlaceholder}
                  defaultValue={company.localAiEndpoint || ""}
                  onChange={() => setIsDirty(true)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="localAiModel">{translations.LocalAIModel}</Label>
                <Input
                  id="localAiModel"
                  name="localAiModel"
                  placeholder={translations.LocalAIModelPlaceholder}
                  defaultValue={company.localAiModel || ""}
                  onChange={() => setIsDirty(true)}
                />
              </div>
            </div>
          )}

          {state?.error && (
            <div role="alert" className="flex items-center gap-2 rounded-md border border-[var(--destructive)]/30 bg-[var(--destructive)]/10 px-3 py-2 text-sm text-[var(--destructive)]">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
              <span>{state.error}</span>
            </div>
          )}
          {state?.success && (
            <div role="status" className="flex items-center gap-2 rounded-md border border-success-border bg-success-muted px-3 py-2 text-sm text-success-muted-fg">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
              <span>{translations.SettingsUpdatedSuccess}</span>
            </div>
          )}

          <Button type="submit">
            {translations.SaveConfiguration}
          </Button>
        </form>

        <AlertDialog open={showNoAiConfirm} onOpenChange={setShowNoAiConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{translations.noAiConfirmTitle}</AlertDialogTitle>
              <AlertDialogDescription>{translations.noAiConfirmMessage}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setShowNoAiConfirm(false)}>{translations.noAiConfirmCancel}</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  formRef.current?.requestSubmit();
                  setShowNoAiConfirm(false);
                }}
              >
                {translations.noAiConfirmAction}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}