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
}

export function AiSettingsForm({ company, companyId, translations }: { company: Company; companyId: string; translations: Translations }) {
  const [aiProvider, setAiProvider] = useState(company.aiProvider);

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
                    ? translations.KeyAlreadyConfigured ?? "Leave blank to keep the existing key"
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