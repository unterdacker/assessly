"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { 
  Building2, 
  ShieldCheck, 
  FileCheck, 
  SendHorizonal, 
  ArrowRight,
  Sparkles,
  AlertCircle,
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
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ExternalAssessmentWorkspaceProps = {
  vendorAssessment: VendorAssessment;
  assessmentId: string;
  questions: Question[];
  initialAnswers: AssessmentAnswer[];
  documentUrl: string | null;
  documentFilename: string | null;
  sessionExpiresAt: string | null;
  token: string;
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
  questions,
  initialAnswers,
  documentUrl,
  documentFilename,
  sessionExpiresAt,
  token,
}: ExternalAssessmentWorkspaceProps) {
  const router = useRouter();
  const [view, setView] = React.useState<"welcome" | "workspace">("welcome");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isSubmitted, setIsSubmitted] = React.useState(false);
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

  const sessionExpiresMs = sessionExpiresAt ? new Date(sessionExpiresAt).getTime() : 0;
  const sessionExpired = Boolean(sessionExpiresMs) && Date.now() >= sessionExpiresMs;

  const sessionExpiryLabel = sessionExpiresAt
    ? new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
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
    try {
      const result = await submitExternalAssessment(vendorAssessment.id, assessmentId);
      if (result.ok) {
        setIsSubmitted(true);
      }
    } catch (err) {
      console.error("Submission error:", err);
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
      setProfileMessage(result.error || "Failed to update profile.");
      setProfileSaving(false);
      return;
    }

    setProfileMessage("Profile updated.");
    setProfileSaving(false);
    router.refresh();
  };

  const handleDeleteAssessmentEvidence = async () => {
    const confirmed = window.confirm("Delete the uploaded evidence document?");
    if (!confirmed) return;

    setDeletingAssessmentEvidence(true);
    const result = await deleteExternalAssessmentDocument(token);

    if (!result.ok) {
      setProfileMessage(result.error || "Failed to delete evidence document.");
      setDeletingAssessmentEvidence(false);
      return;
    }

    setLocalDocumentFilename(null);
    setLocalDocumentUrl(null);
    setProfileMessage("Evidence document deleted.");
    setDeletingAssessmentEvidence(false);
    router.refresh();
  };

  if (isSubmitted) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="max-w-md space-y-6 rounded-xl border border-emerald-100 bg-white p-8 text-center shadow-sm dark:border-emerald-900/30 dark:bg-slate-900">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-900/20">
            <FileCheck className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Assessment Submitted</h1>
            <p className="text-slate-600 dark:text-slate-400">
              Thank you for providing your compliance data. Your responses for <span className="font-semibold text-indigo-600 dark:text-indigo-400">{vendorAssessment.name}</span> have been securely shared with your buyer.
            </p>
          </div>
          <div className="pt-4">
            <p className="text-xs text-slate-400">You can now close this window.</p>
          </div>
        </div>
      </div>
    );
  }

  if (view === "welcome") {
    return (
      <div className="mx-auto max-w-2xl space-y-8 py-12">
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-xl">
            <ShieldCheck className="h-10 w-10" />
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              Welcome to the AVRA Assessment Portal
            </h1>
            <p className="text-lg text-slate-600 dark:text-slate-400">
              Securing the supply chain for <strong>Adventure Huso</strong>.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-md dark:border-slate-800 dark:bg-slate-900 space-y-6">
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Purpose & NIS2 Compliance</h2>
            <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              The European Union's <strong>NIS2 Directive</strong> requires organizations to ensure the security of their supply chains. As a valued partner of <strong>Adventure Huso</strong>, we invite you to complete this security assessment.
            </p>
            <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              This process helps us maintain a high security standard and fulfill our regulatory obligations. You can either upload existing security documentation for AI-assisted analysis or complete the questionnaire manually.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 dark:border-indigo-900/20 dark:bg-indigo-900/10">
              <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-400 mb-2">The Fast Path</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400">Upload your ISO 27001, SOC2, or policy PDF and let AI suggest your answers.</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-400 mb-2">The Direct Path</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400">Answer 20 targeted security questions directly in our interactive wizard.</p>
            </div>
          </div>

          <div className="pt-4">
            <Button onClick={() => setView("workspace")} className="w-full h-12 text-lg bg-indigo-600 hover:bg-indigo-700 shadow-lg">
              Begin Assessment
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </div>

        <p className="text-center text-[10px] text-slate-400 uppercase tracking-widest">
          Secure Isolated Environment · Powered by AVRA Sovereign Compliance Engine
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-10 pb-20">
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
                  <span className="text-xs font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">AVRA Portal</span>
                  <span className="text-slate-300 dark:text-slate-700">|</span>
                  <h1 className="text-sm font-semibold text-slate-900 dark:text-white truncate max-w-[200px] sm:max-w-none">
                    {vendorAssessment.name}
                  </h1>
                </div>
                <p className="text-[10px] text-slate-500 uppercase tracking-tighter">
                  NIS2 Supply Chain Security Assessment
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="hidden flex-col items-end lg:flex">
                <span className="text-xs font-bold text-slate-900 dark:text-white">
                  {progressPercent}% Complete
                </span>
                <span className="text-[10px] text-slate-400">{filledCount} of {questions.length} verified</span>
              </div>
              
              <div className="h-8 w-px bg-slate-200 dark:bg-slate-800 hidden sm:block" />

              <div className="flex items-center gap-2">
                {sessionExpiryLabel && (
                  <span className={cn(
                    "hidden rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wider lg:inline-flex",
                    sessionExpired
                      ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                  )}>
                    {sessionExpired ? "⚠ Session expired" : `⚠ Expires: ${sessionExpiryLabel}`}
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
                    Exit Portal
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
                  {isSubmitting ? "Submitting..." : "Submit Assessment"}
                  {!isSubmitting && <SendHorizonal className="ml-2 h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          </div>
          
          <div className="mt-3">
            <Progress value={progressPercent} className="h-1 w-full bg-slate-100 dark:bg-slate-800" />
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
                  The Fast Way
                </h2>
              </div>
              
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-[10px] font-bold text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-900/20">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Privacy Verified
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <ShieldCheck className="h-5 w-5 text-emerald-500" />
                      Security & Privacy Commitment
                    </DialogTitle>
                    <DialogDescription className="pt-4">
                      <div className="space-y-4">
                        <div className="flex gap-3">
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">
                            🛡️
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">No AI Training</p>
                            <p className="text-xs text-slate-500">Your documents are NEVER used to train or improve the underlying AI models.</p>
                          </div>
                        </div>
                        <div className="flex gap-3">
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">
                            📍
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">EU-Hosted (Germany)</p>
                            <p className="text-xs text-slate-500">All analysis is processed on isolated, sovereign servers in Frankfurt (eu-central-1).</p>
                          </div>
                        </div>
                        <div className="flex gap-3">
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">
                            🗑️
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">Stateless Analysis</p>
                            <p className="text-xs text-slate-500">Documents exist only in memory during analysis. Nothing is stored permanently; files are discarded immediately after.</p>
                          </div>
                        </div>
                        <div className="flex gap-3">
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">
                            🔒
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">TLS 1.3 Encryption</p>
                            <p className="text-xs text-slate-500">Your data is encrypted in transit using the highest industry standards.</p>
                          </div>
                        </div>
                      </div>
                    </DialogDescription>
                  </DialogHeader>
                </DialogContent>
              </Dialog>
            </div>
            <p className="mb-6 text-sm text-slate-600 dark:text-slate-400">
              Upload your security policy or certification (ISO 27001, SOC2). Our AI will analyze your documents to <strong>pre-fill</strong> the questionnaire.
            </p>
            
            <PdfUploadZone vendorId={vendorAssessment.id} />
            
            {localDocumentUrl && (
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
                <span className="text-xs text-slate-500 truncate flex-1">
                  Evidence: <span className="font-medium text-slate-700 dark:text-slate-300">{localDocumentFilename}</span>
                </span>
                <Button variant="outline" size="sm" asChild>
                  <a href={`/api/documents/${assessmentId}`} target="_blank" rel="noopener noreferrer">
                    Open
                  </a>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-red-200 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
                  onClick={handleDeleteAssessmentEvidence}
                  disabled={deletingAssessmentEvidence}
                >
                  {deletingAssessmentEvidence ? "Deleting..." : "Delete"}
                </Button>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-white">
                Company Profile
              </h3>
            </div>

            <form className="space-y-3" onSubmit={handleProfileSave}>
              <div className="space-y-1">
                <Label htmlFor="officialName" className="text-xs">Official Name</Label>
                <Input
                  id="officialName"
                  value={profileForm.officialName}
                  onChange={(e) => setProfileForm((p) => ({ ...p, officialName: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="registrationId" className="text-xs">Registration ID</Label>
                <Input
                  id="registrationId"
                  value={profileForm.registrationId}
                  onChange={(e) => setProfileForm((p) => ({ ...p, registrationId: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="vendorServiceType" className="text-xs">Service Type</Label>
                <Input
                  id="vendorServiceType"
                  value={profileForm.vendorServiceType}
                  onChange={(e) => setProfileForm((p) => ({ ...p, vendorServiceType: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="headquartersLocation" className="text-xs">Headquarters Location</Label>
                <Input
                  id="headquartersLocation"
                  value={profileForm.headquartersLocation}
                  onChange={(e) => setProfileForm((p) => ({ ...p, headquartersLocation: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="securityOfficerName" className="text-xs">Security Officer Name</Label>
                <Input
                  id="securityOfficerName"
                  value={profileForm.securityOfficerName}
                  onChange={(e) => setProfileForm((p) => ({ ...p, securityOfficerName: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="securityOfficerEmail" className="text-xs">Security Officer Email</Label>
                <Input
                  id="securityOfficerEmail"
                  type="email"
                  value={profileForm.securityOfficerEmail}
                  onChange={(e) => setProfileForm((p) => ({ ...p, securityOfficerEmail: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="dpoName" className="text-xs">DPO Name</Label>
                <Input
                  id="dpoName"
                  value={profileForm.dpoName}
                  onChange={(e) => setProfileForm((p) => ({ ...p, dpoName: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="dpoEmail" className="text-xs">DPO Email</Label>
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
                {profileSaving ? "Saving..." : "Save Profile"}
              </Button>
            </form>
          </div>

          <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-4 dark:border-amber-900/20 dark:bg-amber-900/10">
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-400">
                <strong>Important:</strong> AI-suggested answers appear as highlights. You must verify and confirm them in the questionnaire to complete your submission.
              </p>
            </div>
          </div>
        </aside>

        {/* Path B: Direct Path (Right Side) */}
        <div className="space-y-6 lg:col-span-8">
          <div className="flex items-center gap-2 px-2">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">
              Questionnaire
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

      {sessionExpired && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 p-4">
          <div className="w-full max-w-md space-y-4 rounded-xl border border-red-200 bg-white p-6 text-center shadow-xl dark:border-red-900/40 dark:bg-slate-900">
            <h2 className="text-xl font-semibold text-red-700 dark:text-red-300">Session Expired</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Your temporary access window has ended. Please contact your admin to request a new access code.
            </p>
            <Button asChild className="w-full">
              <Link href="/external/portal">Return to Access Portal</Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
