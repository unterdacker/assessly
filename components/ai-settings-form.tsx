"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Sparkles, Globe, Server } from "lucide-react";
import { updateAiSettings } from "@/app/actions/update-settings";
import { useActionState } from "react";

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
  EnterMistralAPIKey: string;
  LocalAIEndpoint: string;
  LocalAIEndpointPlaceholder: string;
  LocalAIModel: string;
  LocalAIModelPlaceholder: string;
  SaveConfiguration: string;
  SettingsUpdatedSuccess: string;
  noAiMode: string;
  noAiModeDesc: string;
  aiFeaturesDisabled: string;
  aiFeaturesDisabledDesc: string;
  aiDisabledBadge: string;
}

export function AiSettingsForm({ company, companyId, translations }: { company: Company; companyId: string; translations: Translations }) {
  const [aiProvider, setAiProvider] = useState(company.aiProvider);
  const [aiDisabledState, setAiDisabledState] = useState(company.aiDisabled);

  const [state, formAction] = useActionState(updateAiSettings, null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          {translations.AIProviderConfiguration}
        </CardTitle>
        <CardDescription>
          {translations.SelectAIProvider}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-6">
          <input type="hidden" name="companyId" value={companyId} />
          <input type="hidden" name="aiProvider" value={aiProvider} />
          <input type="hidden" name="aiDisabled" value={aiDisabledState ? "on" : "false"} />

          <div className="rounded-lg border p-4 space-y-3">
            <div className="space-y-1">
              <Label htmlFor="aiDisabled" className="text-sm font-medium">
                {translations.noAiModeDesc}
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="aiDisabled"
                type="checkbox"
                checked={aiDisabledState}
                onChange={(event) => setAiDisabledState(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              <Label htmlFor="aiDisabled" className="text-sm">
                {translations.noAiMode}
              </Label>
            </div>
          </div>

          {aiDisabledState && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
              <p className="text-xs font-semibold uppercase tracking-wide">{translations.aiDisabledBadge}</p>
              <p className="text-sm font-medium">{translations.aiFeaturesDisabled}</p>
              <p className="text-xs text-amber-800 dark:text-amber-300">{translations.aiFeaturesDisabledDesc}</p>
            </div>
          )}

          <RadioGroup value={aiProvider} onValueChange={setAiProvider}>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="mistral" id="mistral" />
              <Label htmlFor="mistral" className="flex items-center gap-2">
                <Globe className="h-4 w-4" />
                {translations.MistralAI}
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="local" id="local" />
              <Label htmlFor="local" className="flex items-center gap-2">
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
                    ? (translations as unknown as Record<string, string>)["KeyAlreadyConfigured"] ?? "Leave blank to keep the existing key"
                    : translations.EnterMistralAPIKey
                }
                defaultValue=""
              />
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
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="localAiModel">{translations.LocalAIModel}</Label>
                <Input
                  id="localAiModel"
                  name="localAiModel"
                  placeholder={translations.LocalAIModelPlaceholder}
                  defaultValue={company.localAiModel || ""}
                />
              </div>
            </div>
          )}

          {state?.error && <p className="text-red-600 text-sm">{state.error}</p>}
          {state?.success && <p className="text-green-600 text-sm">{translations.SettingsUpdatedSuccess}</p>}

          <Button type="submit">
            {translations.SaveConfiguration}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}