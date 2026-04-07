"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { 
  Building2, 
  ShieldCheck, 
  FileCheck, 
  SendHorizonal, 
  ArrowRight,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  LogOut
} from "lucide-react";
import type { AssessmentAnswer, Question } from "@prisma/client";
import type { VendorAssessment } from "@/lib/vendor-assessment";
import { Button } from "@/components/ui/button";
import { PdfUploadZone } from "@/components/pdf-upload-zone";
import { VendorQuestionnaireWizard } from "./vendor-questionnaire-wizard";
import { Progress } from "@/components/ui/progress";
import { submitExternalAssessment } from "@/app/actions/submit-vendor-assessment";
import {
  deleteExternalAssessmentDocument,
  updateExternalVendorProfileByToken,
} from "@/app/actions/external-portal-actions";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LanguageToggle } from "@/components/language-toggle";
import { ThemeToggle } from "@/components/theme-toggle";

type ExternalAssessmentWorkspaceProps = {
  vendorAssessment: VendorAssessment;
  assessmentId: string;
  isSubmittedInitially?: boolean;
  questions: Question[];
  initialAnswers: AssessmentAnswer[];
  documentUrl: string | null;
  documentFilename: string | null;
  sessionExpiresAt: string | null;
  token: string;
  translations?: Record<string, string>;
};

type WorkspaceAnswer = AssessmentAnswer & {
  verified?: boolean;
};

/**
 * The primary workspace for external third-party vendors.
 * Features a dual-path UX: "Fast Path" (AI-assisted PDF) and "Direct Path" (Manual Entry).
 * Handles the final submission workflow once progress reaches 100%.
 */
export function ExternalAssessmentWorkspace({
  vendorAssessment,
  assessmentId,
  isSubmittedInitially = false,
  questions,
  initialAnswers,
  documentUrl,
  documentFilename,
  sessionExpiresAt,
  token,
}: ExternalAssessmentWorkspaceProps) {
  const t = useTranslations("externalAssessment");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [view, setView] = React.useState<"welcome" | "workspace">(
    searchParams.get("view") === "workspace" ? "workspace" : "welcome"
  );
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isSubmitted, setIsSubmitted] = React.useState(isSubmittedInitially);
  const [submitSuccess, setSubmitSuccess] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [answers, setAnswers] = React.useState<WorkspaceAnswer[]>(initialAnswers);
  const [profileSaving, setProfileSaving] = React.useState(false);
  const [profileMessage, setProfileMessage] = React.useState<string | null>(null);
  const [deletingAssessmentEvidence, setDeletingAssessmentEvidence] = React.useState(false);
  const [profileForm, setProfileForm] = React.useState({
    officialName: vendorAssessment.vendor?.officialName || vendorAssessment.name || "",
    registrationId: vendorAssessment.vendor?.registrationId || "",
    vendorServiceType: vendorAssessment.vendor?.vendorServiceType || vendorAssessment.serviceType || "",
    headquartersLocation: vendorAssessment.vendor?.headquartersLocation || "",
    securityOfficerName: vendorAssessment.vendor?.securityOfficerName || "",
    securityOfficerEmail: vendorAssessment.vendor?.securityOfficerEmail || "",
    dpoName: vendorAssessment.vendor?.dpoName || "",
    dpoEmail: vendorAssessment.vendor?.dpoEmail || "",
  });

  const [localDocumentFilename, setLocalDocumentFilename] = React.useState<string | null>(documentFilename);
  const [localDocumentUrl, setLocalDocumentUrl] = React.useState<string | null>(documentUrl);

  React.useEffect(() => {
    setAnswers(initialAnswers);
  }, [initialAnswers]);

  React.useEffect(() => {
    setLocalDocumentFilename(documentFilename);
    setLocalDocumentUrl(documentUrl);
  }, [documentFilename, documentUrl]);

  React.useEffect(() => {
    const nextView = searchParams.get("view") === "workspace" ? "workspace" : "welcome";
    setView(nextView);
  }, [searchParams]);

  const setViewWithUrl = React.useCallback((nextView: "welcome" | "workspace") => {
    setView(nextView);
    const params = new URLSearchParams(searchParams.toString());
    if (nextView === "workspace") {
      params.set("view", "workspace");
    } else {
      params.delete("view");
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const sessionExpiresMs = sessionExpiresAt ? new Date(sessionExpiresAt).getTime() : 0;
  const nowMs = Date.now();
  const msUntilExpiry = sessionExpiresMs ? sessionExpiresMs - nowMs : null;
  const sessionExpired = msUntilExpiry !== null ? msUntilExpiry <= 0 : false;
  const expiryWithinOneHour = msUntilExpiry !== null && msUntilExpiry > 0 && msUntilExpiry <= 60 * 60 * 1000;
  const expiryWithinTenMinutes = msUntilExpiry !== null && msUntilExpiry > 0 && msUntilExpiry <= 10 * 60 * 1000;

  const sessionExpiryLabel = sessionExpiresAt
    ? new Intl.DateTimeFormat(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(sessionExpiresAt))
    : null;

  // Calculate progress using our standard 20-question logic
  const filledCount = answers.filter(
    (a) =>
      (a.status === "COMPLIANT" || a.status === "NON_COMPLIANT" || a.status === "NOT_APPLICABLE") &&
      a.verified
  ).length;
  const progressPercent = Math.round((filledCount / questions.length) * 100);
  const isComplete = filledCount === questions.length;

  const handleSubmit = async () => {
    if (!isComplete) return;
    
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const result = await submitExternalAssessment({
        vendorId: vendorAssessment.id,
        assessmentId,
        token,
      });
      if (result.ok) {
        setIsSubmitted(true);
        setSubmitSuccess(true);
        setSubmitError(null);
      } else if (result.code === "DEADLINE_PASSED" && result.expiresAt) {
        const exactExpiry = new Intl.DateTimeFormat(undefined, {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(result.expiresAt));
        setSubmitError(t("submission.deadlinePassed", { expiry: exactExpiry }));
      } else {
        setSubmitError(result.error || t("submission.genericFailed"));
      }
    } catch (err) {
      console.error("Submission error:", err);
      setSubmitError(t("submission.genericFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleProfileSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProfileSaving(true);
    setProfileMessage(null);

    const result = await updateExternalVendorProfileByToken({
      token,
      ...profileForm,
    });

    if (!result.ok) {
      setProfileMessage(result.error || t("profile.messages.updateFailed"));
      setProfileSaving(false);
      return;
    }

    setProfileMessage(t("profile.messages.updated"));
    setProfileSaving(false);
    router.refresh();
  };

  const handleDeleteAssessmentEvidence = async () => {
    const confirmed = window.confirm(t("evidence.confirmDelete"));
    if (!confirmed) return;

    setDeletingAssessmentEvidence(true);
    const result = await deleteExternalAssessmentDocument(token);

    if (!result.ok) {
      setProfileMessage(result.error || t("evidence.deleteFailed"));
      setDeletingAssessmentEvidence(false);
      return;
    }

    setLocalDocumentFilename(null);
    setLocalDocumentUrl(null);
    setProfileMessage(t("evidence.deleted"));
    setDeletingAssessmentEvidence(false);
    router.refresh();
  };

  if (isSubmitted && sessionExpired) {
    return (
      <div className="relative flex min-h-[60vh] items-center justify-center">
        <div className="fixed right-4 top-4 z-[130] flex items-center gap-2">
          <ThemeToggle />
          <LanguageToggle />
        </div>
        <div className="max-w-md space-y-6 rounded-xl border border-emerald-100 bg-white p-8 text-center shadow-sm dark:border-emerald-900/30 dark:bg-slate-900">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-900/20">
            <FileCheck className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t("submitted.title")}</h1>
            <p className="text-slate-600 dark:text-slate-400">
              {t.rich("submitted.description", {
                vendorName: vendorAssessment.name,
                strong: (chunks) => <span className="font-semibold text-indigo-600 dark:text-indigo-400">{chunks}</span>,
              })}
            </p>
          </div>
          <div className="pt-4">
            <p className="text-xs text-slate-400">{t("submitted.closeHint")}</p>
          </div>
        </div>
      </div>
    );
  }

  if (view === "welcome") {
    return (
      <div className="relative mx-auto max-w-2xl space-y-8 py-12">
        <div className="fixed right-4 top-4 z-[130] flex items-center gap-2">
          <ThemeToggle />
          <LanguageToggle />
        </div>
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-xl">
            <ShieldCheck className="h-10 w-10" />
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              {t("welcome.title")}
            </h1>
            <p className="text-lg text-slate-600 dark:text-slate-400">
              {t.rich("welcome.subtitle", {
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-md dark:border-slate-800 dark:bg-slate-900 space-y-6">
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{t("welcome.purposeTitle")}</h2>
            <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              {t.rich("welcome.purposeBody1", {
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </p>
            <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              {t("welcome.purposeBody2")}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 dark:border-indigo-900/20 dark:bg-indigo-900/10">
              <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-400 mb-2">{t("welcome.fastPathTitle")}</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400">{t("welcome.fastPathBody")}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-400 mb-2">{t("welcome.directPathTitle")}</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400">{t("welcome.directPathBody")}</p>
            </div>
          </div>

          <div className="pt-4">
            <Button onClick={() => setViewWithUrl("workspace")} className="w-full h-12 text-lg bg-indigo-600 hover:bg-indigo-700 shadow-lg">
              {t("welcome.beginButton")}
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </div>

        <p className="text-center text-[10px] text-slate-400 uppercase tracking-widest">
          {t("welcome.footer")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-10 pb-20">
      <div className="fixed right-4 top-4 z-[130] flex items-center gap-2">
        <ThemeToggle />
        <LanguageToggle />
      </div>
      {/* Header & Progress Bar */}
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/95 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">{t("header.portalTag")}</span>
                  <span className="text-slate-300 dark:text-slate-700">|</span>
                  <h1 className="text-sm font-semibold text-slate-900 dark:text-white truncate max-w-[200px] sm:max-w-none">
                    {vendorAssessment.name}
                  </h1>
                </div>
                <p className="text-[10px] text-slate-500 uppercase tracking-tighter">
                  {t("header.title")}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="hidden flex-col items-end lg:flex">
                <span className="text-xs font-bold text-slate-900 dark:text-white">
                  {t("header.progressComplete", { progress: progressPercent })}
                </span>
                <span className="text-[10px] text-slate-400">{t("header.progressVerified", { filled: filledCount, total: questions.length })}</span>
              </div>
              
              <div className="h-8 w-px bg-slate-200 dark:bg-slate-800 hidden sm:block" />

              <div className="flex items-center gap-2">
                {sessionExpiryLabel && (
                  <span className={cn(
                    "hidden rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wider lg:inline-flex",
                    sessionExpired
                      ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                      : expiryWithinTenMinutes
                        ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                        : expiryWithinOneHour
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                          : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  )}>
                    {sessionExpired
                      ? t("header.sessionExpiredBadge")
                      : t("header.linkExpiresAt", { expiry: sessionExpiryLabel })}
                  </span>
                )}
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="gap-2 text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400"
                  asChild
                >
                  <Link href="/api/exit-portal">
                    <LogOut className="h-4 w-4" />
                    {t("header.exitPortal")}
                  </Link>
                </Button>
                <Button 
                  onClick={handleSubmit} 
                  disabled={!isComplete || isSubmitting}
                  size="sm"
                  className={cn(
                    "h-9 px-4 shadow-sm transition-all",
                    isComplete ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
                  )}
                >
                  {isSubmitting ? t("header.submitting") : isSubmitted ? t("header.resubmit") : t("header.submit")}
                  {!isSubmitting && <SendHorizonal className="ml-2 h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          </div>
          
          <div className="mt-3">
            <Progress value={progressPercent} className="h-1 w-full bg-slate-100 dark:bg-slate-800" />
            {submitSuccess && (
              <div className="mt-2 flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                <span className="flex-1">{t("submission.success")}</span>
                <button
                  type="button"
                  onClick={() => setSubmitSuccess(false)}
                  className="ml-2 text-emerald-600 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-200"
                  aria-label="Schließen"
                >
                  ✕
                </button>
              </div>
            )}
            {isSubmitted && !sessionExpired && !submitSuccess && sessionExpiryLabel && (
              <p className="mt-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-300">
                {t("submission.previouslySubmitted", { expiry: sessionExpiryLabel })}
              </p>
            )}
            {submitError && (
              <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
                {submitError}
              </p>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Grid */}
      <div className="grid gap-8 lg:grid-cols-12 lg:items-start">
        
        {/* Path A: Fast Path (Left Side) */}
        <aside className="space-y-6 lg:col-span-4 lg:sticky lg:top-32">
          <div className="rounded-xl border border-indigo-100 bg-white p-6 shadow-sm dark:border-indigo-900/30 dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-indigo-500 animate-pulse" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-white">
                  {t("fastPath.title")}
                </h2>
              </div>
              
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-[10px] font-bold text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-900/20">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    {t("privacy.badge")}
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <ShieldCheck className="h-5 w-5 text-emerald-500" />
                      {t("privacy.title")}
                    </DialogTitle>
                    <DialogDescription className="pt-4">
                      <div className="space-y-4">
                        <div className="flex gap-3">
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">
                            🛡️
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">{t("privacy.items.noAiTraining.title")}</p>
                            <p className="text-xs text-slate-500">{t("privacy.items.noAiTraining.body")}</p>
                          </div>
                        </div>
                        <div className="flex gap-3">
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">
                            📍
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">{t("privacy.items.euHosted.title")}</p>
                            <p className="text-xs text-slate-500">{t("privacy.items.euHosted.body")}</p>
                          </div>
                        </div>
                        <div className="flex gap-3">
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">
                            🗑️
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">{t("privacy.items.stateless.title")}</p>
                            <p className="text-xs text-slate-500">{t("privacy.items.stateless.body")}</p>
                          </div>
                        </div>
                        <div className="flex gap-3">
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">
                            🔒
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">{t("privacy.items.tls.title")}</p>
                            <p className="text-xs text-slate-500">{t("privacy.items.tls.body")}</p>
                          </div>
                        </div>
                      </div>
                    </DialogDescription>
                  </DialogHeader>
                </DialogContent>
              </Dialog>
            </div>
            <p className="mb-6 text-sm text-slate-600 dark:text-slate-400">
              {t.rich("fastPath.description", {
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </p>
            
            <PdfUploadZone
              vendorId={vendorAssessment.id}
              isAdminView={false}
              assessmentId={assessmentId}
              storedDocumentFilename={localDocumentFilename}
              documentUrl={localDocumentUrl}
              lastAuditedAt={vendorAssessment.updatedAt}
            />
            
            {localDocumentUrl && (
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
                <span className="text-xs text-slate-500 truncate flex-1">
                  {t("evidence.label")} <span className="font-medium text-slate-700 dark:text-slate-300">{localDocumentFilename}</span>
                </span>
                <Button variant="outline" size="sm" asChild>
                  <a href={`/api/documents/${assessmentId}`} target="_blank" rel="noopener noreferrer">
                    {t("evidence.open")}
                  </a>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-red-200 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
                  onClick={handleDeleteAssessmentEvidence}
                  disabled={deletingAssessmentEvidence}
                >
                  {deletingAssessmentEvidence ? t("evidence.deleting") : t("evidence.delete")}
                </Button>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-white">
                {t("profile.title")}
              </h3>
            </div>

            <form className="space-y-3" onSubmit={handleProfileSave}>
              <div className="space-y-1">
                <Label htmlFor="officialName" className="text-xs">{t("profile.fields.officialName")}</Label>
                <Input
                  id="officialName"
                  value={profileForm.officialName}
                  onChange={(e) => setProfileForm((p) => ({ ...p, officialName: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="registrationId" className="text-xs">{t("profile.fields.registrationId")}</Label>
                <Input
                  id="registrationId"
                  value={profileForm.registrationId}
                  onChange={(e) => setProfileForm((p) => ({ ...p, registrationId: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="vendorServiceType" className="text-xs">{t("profile.fields.serviceType")}</Label>
                <Input
                  id="vendorServiceType"
                  value={profileForm.vendorServiceType}
                  onChange={(e) => setProfileForm((p) => ({ ...p, vendorServiceType: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="headquartersLocation" className="text-xs">{t("profile.fields.headquartersLocation")}</Label>
                <Input
                  id="headquartersLocation"
                  value={profileForm.headquartersLocation}
                  onChange={(e) => setProfileForm((p) => ({ ...p, headquartersLocation: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="securityOfficerName" className="text-xs">{t("profile.fields.securityOfficerName")}</Label>
                <Input
                  id="securityOfficerName"
                  value={profileForm.securityOfficerName}
                  onChange={(e) => setProfileForm((p) => ({ ...p, securityOfficerName: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="securityOfficerEmail" className="text-xs">{t("profile.fields.securityOfficerEmail")}</Label>
                <Input
                  id="securityOfficerEmail"
                  type="email"
                  value={profileForm.securityOfficerEmail}
                  onChange={(e) => setProfileForm((p) => ({ ...p, securityOfficerEmail: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="dpoName" className="text-xs">{t("profile.fields.dpoName")}</Label>
                <Input
                  id="dpoName"
                  value={profileForm.dpoName}
                  onChange={(e) => setProfileForm((p) => ({ ...p, dpoName: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="dpoEmail" className="text-xs">{t("profile.fields.dpoEmail")}</Label>
                <Input
                  id="dpoEmail"
                  type="email"
                  value={profileForm.dpoEmail}
                  onChange={(e) => setProfileForm((p) => ({ ...p, dpoEmail: e.target.value }))}
                />
              </div>

              {profileMessage && (
                <p className="text-xs text-slate-500 dark:text-slate-400">{profileMessage}</p>
              )}

              <Button type="submit" className="w-full" disabled={profileSaving}>
                {profileSaving ? t("profile.saving") : t("profile.save")}
              </Button>
            </form>
          </div>

          <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-4 dark:border-amber-900/20 dark:bg-amber-900/10">
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-400">
                {t.rich("importantMessage", {
                  strong: (chunks) => <strong>{chunks}</strong>,
                })}
              </p>
            </div>
          </div>
        </aside>

        {/* Path B: Direct Path (Right Side) */}
        <div className="space-y-6 lg:col-span-8">
          <div className="flex items-center gap-2 px-2">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">
              {t("questionnaire")}
            </h2>
            <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
          </div>

          <VendorQuestionnaireWizard 
            questions={questions}
            initialAnswers={answers}
            assessmentId={assessmentId}
            token={token}
            onAnswerSaved={(updatedAnswer) => {
              setAnswers((prev) => {
                const existingIndex = prev.findIndex((a) => a.questionId === updatedAnswer.questionId);
                if (existingIndex === -1) {
                  return [...prev, updatedAnswer as WorkspaceAnswer];
                }

                const clone = [...prev];
                clone[existingIndex] = {
                  ...clone[existingIndex],
                  ...updatedAnswer,
                } as WorkspaceAnswer;
                return clone;
              });
            }}
          />
        </div>
      </div>

      {sessionExpired && !isSubmitted && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 p-4">
          <div className="w-full max-w-md space-y-4 rounded-xl border border-red-200 bg-white p-6 text-center shadow-xl dark:border-red-900/40 dark:bg-slate-900">
            <h2 className="text-xl font-semibold text-red-700 dark:text-red-300">{t("sessionExpired.title")}</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {t("sessionExpired.description")}
            </p>
            <Button asChild className="w-full">
              <Link href="/external/portal">{t("sessionExpired.returnToPortal")}</Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
