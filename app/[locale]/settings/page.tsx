import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { ShieldCheck, Server, Globe } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AiSettingsForm } from "@/components/ai-settings-form";
import { PasswordSettings } from "@/components/password-settings";
import { prisma } from "@/lib/prisma";
import { requirePageRole } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return {
    title: t("Settings"),
    description: t("SettingsDesc"),
  };
}

type SettingsPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function SettingsPage({ params }: SettingsPageProps) {
  const { locale } = await params;
  const session = await requirePageRole(["ADMIN", "AUDITOR"], locale);
  const t = await getTranslations();
  const isAdmin = session.role === "ADMIN";
  const company = isAdmin
    ? await prisma.company.findUnique({ where: { id: session.companyId ?? "" } })
    : null;

  if (isAdmin && !company) {
    return <div>Company not found</div>; // Or redirect
  }

  const isLocal = company?.aiProvider === "local";

  const aiTranslations = {
    AIProviderConfiguration: t("AIProviderConfiguration"),
    SelectAIProvider: t("SelectAIProvider"),
    MistralAI: t("MistralAI"),
    LocalServer: t("LocalServer"),
    MistralAPIKey: t("MistralAPIKey"),
    EnterMistralAPIKey: t("EnterMistralAPIKey"),
    LocalAIEndpoint: t("LocalAIEndpoint"),
    LocalAIEndpointPlaceholder: t("LocalAIEndpointPlaceholder"),
    LocalAIModel: t("LocalAIModel"),
    LocalAIModelPlaceholder: t("LocalAIModelPlaceholder"),
    SaveConfiguration: t("SaveConfiguration"),
    SettingsUpdatedSuccess: t("SettingsUpdatedSuccess"),
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("OrganizationSettings")}</h1>
        <p className="text-muted-foreground">{t("SettingsDesc")}</p>
      </div>

      <div className="grid gap-6">
        {isAdmin && company && (
          <AiSettingsForm company={company} companyId={company.id} translations={aiTranslations} />
        )}

        {isAdmin && company && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                {t("CurrentDataResidency")}
              </CardTitle>
              <CardDescription>
                {t("VerifyDataResidency")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center rounded-lg border p-4 bg-slate-50/50 dark:bg-slate-900/30">
                <div className="space-y-1">
                  <p className="text-sm font-medium leading-none">{t("AIDataProcessingLocation")}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("CurrentEnvironmentRouting")}
                  </p>
                </div>

                <div className="flex flex-col items-end gap-2">
                  {isLocal ? (
                    <Badge variant="outline" className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800">
                      <Server className="h-3.5 w-3.5" />
                      {t("DataProcessingLocal")}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800">
                      <Globe className="h-3.5 w-3.5" />
                      {t("DataProcessingFrance")}
                    </Badge>
                  )}
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                    {t("Provider")}: {company.aiProvider}
                  </span>
                </div>
              </div>

              <p className="text-xs text-muted-foreground mt-4 leading-relaxed">
                {t("ResidencyMessage")}
                {isLocal
                  ? " " + t("LocalResidencyNote")
                  : " " + t("EUResidencyNote")}
              </p>
            </CardContent>
          </Card>
        )}

        <PasswordSettings />
      </div>
    </div>
  );
}
