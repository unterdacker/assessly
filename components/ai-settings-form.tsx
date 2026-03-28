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
}

export function AiSettingsForm({ company, companyId }: { company: Company; companyId: string }) {
  const [aiProvider, setAiProvider] = useState(company.aiProvider);

  const [state, formAction] = useActionState(updateAiSettings, null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          AI Provider Configuration
        </CardTitle>
        <CardDescription>
          Select your preferred AI provider for NIS2 assessments. Data processing location affects compliance.
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
                Mistral AI (EU Cloud)
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="local" id="local" />
              <Label htmlFor="local" className="flex items-center gap-2">
                <Server className="h-4 w-4" />
                Local Server (On-Premise)
              </Label>
            </div>
          </RadioGroup>

          {aiProvider === "mistral" && (
            <div className="space-y-2">
              <Label htmlFor="mistralApiKey">Mistral API Key</Label>
              <Input
                id="mistralApiKey"
                name="mistralApiKey"
                type="password"
                placeholder="Enter your Mistral API Key"
                defaultValue={company.mistralApiKey || ""}
              />
            </div>
          )}

          {aiProvider === "local" && (
            <div className="space-y-2">
              <Label htmlFor="localAiEndpoint">Local AI Endpoint</Label>
              <Input
                id="localAiEndpoint"
                name="localAiEndpoint"
                placeholder="http://localhost:11434/v1"
                defaultValue={company.localAiEndpoint || ""}
              />
            </div>
          )}

          {state?.error && <p className="text-red-600 text-sm">{state.error}</p>}
          {state?.success && <p className="text-green-600 text-sm">Settings updated successfully!</p>}

          <Button type="submit">
            Save Configuration
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}