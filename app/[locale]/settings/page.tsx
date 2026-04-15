import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { ShieldCheck, Server, Globe, Mail, ChevronRight, Ban, Webhook, Key } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AiSettingsForm } from "@/components/ai-settings-form";
import { PasswordSettings } from "@/components/password-settings";
import { MfaSettings } from "@/components/mfa-settings";
import { OrgMfaPolicyForm } from "@/components/org-mfa-policy-form";
import { prisma } from "@/lib/prisma";
import { requirePageRole } from "@/lib/auth/server";
import { ClipboardList } from "lucide-react";
import { CustomQuestionsManager } from "@/components/custom-questions-manager";
import { getCustomQuestions } from "@/lib/queries/custom-questions";

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
  const session = await requirePageRole(["ADMIN"], locale);
  const t = await getTranslations();
  const oidcT = await getTranslations("OidcSettings");
  const webhooksT = await getTranslations("WebhooksSettings");
  const apiKeysT = await getTranslations("ApiKeys");
  const isAdmin = session.role === "ADMIN";
  const [company, currentUser, customQuestions] = await Promise.all([
    isAdmin
      ? prisma.company.findUnique({
          where: { id: session.companyId ?? "" },
          select: {
            id: true,
            name: true,
            slug: true,
            aiProvider: true,
            aiDisabled: true,
            mistralApiKey: true,
            localAiEndpoint: true,
            localAiModel: true,
            mfaRequired: true,
            plan: true,
          },
        })
      : Promise.resolve(null),
    prisma.user.findUnique({
      where: { id: session.userId },
      select: { mfaEnabled: true, mfaRecoveryCodes: true },
    }),
    isAdmin && session.companyId
      ? getCustomQuestions(session.companyId)
      : Promise.resolve([]),
  ]);

  if (isAdmin && !company) {
    return <div>Company not found</div>; // Or redirect
  }

  const isLocal = company?.aiProvider === "local";
  const isNoAi = company?.aiProvider === "no-ai" || company?.aiDisabled === true;
  const providerDisplayName =
    company?.aiProvider === "mistral" ? "Mistral AI"
    : company?.aiProvider === "local" ? "Local Server"
    : "No AI Mode";

  // Never send the encrypted key value to the browser — pass null so the form
  // shows an empty password field.  The action preserves the existing encrypted
  // key when the field is left blank (see update-settings.ts).
  const companyForForm = company
    ? { ...company, mistralApiKey: company.mistralApiKey ? "" : null }
    : null;
  const isPremium = company?.plan === "PREMIUM";
  const aiTranslations = {
    AIProviderConfiguration: t("AIProviderConfiguration"),
    SelectAIProvider: t("SelectAIProvider"),
    MistralAI: t("MistralAI"),
    LocalServer: t("LocalServer"),
    noAiMode: t("noAiMode"),
    noAiModeDesc: t("noAiModeDesc"),
    noAiConfirmMessage: t("noAiConfirmMessage"),
    aiFeaturesDisabled: t("aiFeaturesDisabled"),
    aiFeaturesDisabledDesc: t("aiFeaturesDisabledDesc"),
    aiDisabledBadge: t("aiDisabledBadge"),
    MistralAPIKey: t("MistralAPIKey"),
    KeyAlreadyConfigured: t("KeyAlreadyConfigured"),
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
        {isAdmin && companyForForm && (
          <AiSettingsForm company={companyForForm} companyId={companyForForm.id} translations={aiTranslations} />
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
                  {isNoAi ? (
                    <Badge variant="outline" className="flex items-center gap-1.5 px-3 py-1 bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/30 dark:text-slate-400 dark:border-slate-700">
                      <Ban className="h-3.5 w-3.5" />
                      {t("DataProcessingDisabled")}
                    </Badge>
                  ) : isLocal ? (
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
                  {!isNoAi && (
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                      {t("Provider")}: {providerDisplayName}
                    </span>
                  )}
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
        <MfaSettings
          mfaEnabled={currentUser?.mfaEnabled ?? false}
          hasRecoveryCodes={Boolean(currentUser?.mfaRecoveryCodes?.length)}
        />

        {isAdmin && company && (
          <OrgMfaPolicyForm
            mfaRequired={company.mfaRequired}
            adminHasMfa={currentUser?.mfaEnabled ?? false}
          />
        )}

        {isAdmin && (
          <Link
            href={`/${locale}/settings/mail`}
            className="group flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-indigo-300 hover:bg-indigo-50/40 dark:border-slate-800 dark:bg-card dark:hover:border-indigo-700 dark:hover:bg-indigo-950/20"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
                <Mail className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">{t("MailSettingsTitle")}</p>
                <p className="text-xs text-muted-foreground">{t("MailSettingsDesc")}</p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
        )}

        {isAdmin && (
          <Link
            href={`/${locale}/settings/sso`}
            className="group flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-indigo-300 hover:bg-indigo-50/40 dark:border-slate-800 dark:bg-card dark:hover:border-indigo-700 dark:hover:bg-indigo-950/20"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">{oidcT("title")}</p>
                <p className="text-xs text-muted-foreground">{oidcT("description")}</p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
        )}

        {isAdmin && (
          <Link
            href={`/${locale}/settings/webhooks`}
            className="group flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-indigo-300 hover:bg-indigo-50/40 dark:border-slate-800 dark:bg-card dark:hover:border-indigo-700 dark:hover:bg-indigo-950/20"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
                <Webhook className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">{webhooksT("title")}</p>
                <p className="text-xs text-muted-foreground">{webhooksT("description")}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!isPremium && (
                <Badge variant="outline" className="text-xs text-amber-700 border-amber-300 bg-amber-50 dark:text-amber-400 dark:border-amber-700 dark:bg-amber-950/30">
                  {t("Premium")}
                </Badge>
              )}
              <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </div>
          </Link>
        )}

        {isAdmin && (
          <Link
            href={`/${locale}/settings/api-keys`}
            className="group flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-indigo-300 hover:bg-indigo-50/40 dark:border-slate-800 dark:bg-card dark:hover:border-indigo-700 dark:hover:bg-indigo-950/20"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
                <Key className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">{apiKeysT("title")}</p>
                <p className="text-xs text-muted-foreground">{apiKeysT("description")}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!isPremium && (
                <Badge variant="outline" className="text-xs text-amber-700 border-amber-300 bg-amber-50 dark:text-amber-400 dark:border-amber-700 dark:bg-amber-950/30">
                  {t("Premium")}
                </Badge>
              )}
              <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </div>
          </Link>
        )}

        {isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                {t("CustomQuestions.title")}
              </CardTitle>
              <CardDescription>{t("CustomQuestions.description")}</CardDescription>
            </CardHeader>
            <CardContent>
              <CustomQuestionsManager
                initialQuestions={customQuestions}
                translations={{
                  title: t("CustomQuestions.title"),
                  description: t("CustomQuestions.description"),
                  addQuestion: t("CustomQuestions.addQuestion"),
                  questionText: t("CustomQuestions.questionText"),
                  questionTextPlaceholder: t("CustomQuestions.questionTextPlaceholder"),
                  guidanceOptional: t("CustomQuestions.guidanceOptional"),
                  guidancePlaceholder: t("CustomQuestions.guidancePlaceholder"),
                  categoryLabel: t("CustomQuestions.categoryLabel"),
                  categoryDefault: t("CustomQuestions.categoryDefault"),
                  save: t("CustomQuestions.save"),
                  saving: t("CustomQuestions.saving"),
                  cancel: t("CustomQuestions.cancel"),
                  edit: t("CustomQuestions.edit"),
                  delete_: t("CustomQuestions.delete"),
                  deleteConfirm: t("CustomQuestions.deleteConfirm"),
                  limitReached: t("CustomQuestions.limitReached"),
                  noQuestions: t("CustomQuestions.noQuestions"),
                  errorEmpty: t("CustomQuestions.errorEmpty"),
                  errorSave: t("CustomQuestions.errorSave"),
                  errorDelete: t("CustomQuestions.errorDelete"),
                  errorReorder: t("CustomQuestions.errorReorder"),
                  moveUp: t("CustomQuestions.moveUp"),
                  moveDown: t("CustomQuestions.moveDown"),
                }}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
