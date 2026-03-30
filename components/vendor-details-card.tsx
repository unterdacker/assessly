"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { 
  MapPin, 
  ShieldCheck, 
  UserRoundCheck, 
  Fingerprint, 
  Mail, 
  Edit3,
  CheckCircle2,
  AlertCircle,
  Copy,
  SendHorizonal,
  ShieldAlert,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EditVendorProfileModal } from "@/components/edit-vendor-profile-modal";
import { InviteVendorModal } from "@/components/admin/invite-vendor-modal";
import { cn } from "@/lib/utils";
import type { VendorAssessment } from "@/lib/vendor-assessment";
import { calculateDossierCompletion } from "@/lib/vendor-assessment";

interface VendorDetailsCardProps {
  vendorAssessment: VendorAssessment;
  companyId: string;
}

/**
 * A "Hybrid Information Card" for the Assessment Workspace.
 * Dynamically calculates dossier completeness based on 6 specific audit-relevant fields.
 * Provides granular "Missing Data" warnings (red/yellow indicators) for auditors.
 */
export function VendorDetailsCard({ vendorAssessment, companyId }: VendorDetailsCardProps) {
  const t = useTranslations("assessment.details");

  const v = vendorAssessment.vendor;
  const [hasCopiedCode, setHasCopiedCode] = React.useState(false);

  const progressPercent = calculateDossierCompletion(v);
  const isComplete = progressPercent === 100;
  const hasActiveCode = Boolean(vendorAssessment.isCodeActive && vendorAssessment.accessCode);

  const formatAccessCodeExpiry = (value: string | null) => {
    if (!value) return t("noActiveCode");
    const expiresAt = new Date(value);
    if (!Number.isFinite(expiresAt.getTime())) return t("noActiveCode");
    if (expiresAt.getTime() <= Date.now()) return t("expired");

    const formatted = new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(expiresAt);

    return `${t("expires")}: ${formatted}`;
  };

  const handleCopyCodeOnly = async () => {
    if (!vendorAssessment.accessCode) return;
    try {
      await navigator.clipboard.writeText(vendorAssessment.accessCode);
      setHasCopiedCode(true);
      window.setTimeout(() => setHasCopiedCode(false), 1200);
    } catch {
      window.alert(t("copyFailed"));
    }
  };

  // Common modal initial data
  const modalInitialData = {
    officialName: v?.officialName || vendorAssessment.name,
    registrationId: v?.registrationId,
    vendorServiceType: v?.vendorServiceType || vendorAssessment.serviceType,
    securityOfficerName: v?.securityOfficerName,
    securityOfficerEmail: v?.securityOfficerEmail,
    dpoName: v?.dpoName,
    dpoEmail: v?.dpoEmail,
    headquartersLocation: v?.headquartersLocation,
  };

  /** Helper for combined Contact Name (Email) logic with individual missing warnings. */
  const renderContact = (name: string | undefined, email: string | undefined, label: string) => {
    if (!name && !email) {
      return (
        <div className="flex items-center gap-2 text-sm italic text-red-500/70 dark:text-red-400/50">
          <AlertCircle className="h-3 w-3 fill-red-500/20" />
          {t("missingContact", { label: label.toLowerCase() })}
        </div>
      );
    }

    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-slate-700 dark:text-slate-200">
        <span>{name || <span className="text-amber-500/70 dark:text-amber-400/50">{t("missingName")} ⚠️</span>}</span>
        {email ? (
          <a 
            href={`mailto:${email}`}
            className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline dark:text-indigo-400"
          >
            <Mail className="h-3 w-3" />
            ({email})
          </a>
        ) : (
          <span className="text-xs text-amber-500/70 dark:text-amber-400/50 italic underline decoration-dotted">
            {t("missingEmail")} ⚠️
          </span>
        )}
      </div>
    );
  };

  return (
    <Card className="relative overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
      {/* Dossier Progress Bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-slate-100 dark:bg-slate-800">
        <div 
          className={cn(
            "h-full transition-all duration-700 ease-out",
            isComplete ? "bg-emerald-500" : "bg-indigo-500"
          )}
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <CardContent className="p-6">
        {/* Header: Company Name & Completeness Badge */}
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="truncate text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                {v?.officialName || vendorAssessment.name}
              </h2>
              <Badge variant="secondary" className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                {vendorAssessment.serviceType}
              </Badge>
            </div>
            
            <div className="flex items-center gap-3">
              {isComplete ? (
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {t("dossierVerified")}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                    {t("dossierComplete", { progress: progressPercent })}
                  </span>
                  <div className="h-1 w-24 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div className="h-full bg-indigo-500" style={{ width: `${progressPercent}%` }} />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-start gap-2">
            {/* Compact status tags */}
            <div className="flex flex-wrap items-start gap-2">
              <div className="inline-flex flex-col gap-0.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 dark:border-slate-700 dark:bg-slate-900">
                {hasActiveCode ? (
                  <>
                    <div className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wider text-slate-900 dark:text-slate-100">
                      <span className="font-mono">{vendorAssessment.accessCode}</span>
                      <button
                        type="button"
                        aria-label={t("copyAccessCodeAria", { vendorName: vendorAssessment.name })}
                        onClick={handleCopyCodeOnly}
                        className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      {hasCopiedCode && (
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400">{t("copied")}</span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-600 dark:text-slate-300">
                      {formatAccessCodeExpiry(vendorAssessment.codeExpiresAt)}
                    </p>
                  </>
                ) : (
                  <>
                    <span className="text-xs text-muted-foreground">{t("noActiveCode")}</span>
                    <p className="text-[10px] text-muted-foreground">{t("generateCodeInvite")}</p>
                  </>
                )}
              </div>

              {vendorAssessment.inviteSentAt ? (
                <div className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                  <Mail className="h-3 w-3 shrink-0" />
                  {t("inviteSent")} {new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(vendorAssessment.inviteSentAt))}
                </div>
              ) : null}

              {vendorAssessment.inviteSentAt && (
                vendorAssessment.isFirstLogin ? (
                  <div className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-100 px-2.5 py-1.5 text-xs font-semibold text-amber-900 dark:border-amber-700/60 dark:bg-amber-900/30 dark:text-amber-200">
                    <ShieldAlert className="h-3 w-3 shrink-0" />
                    {t("passwordPending")}
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 dark:border-emerald-800/40 dark:bg-emerald-900/20 dark:text-emerald-300">
                    <ShieldCheck className="h-3 w-3 shrink-0" />
                    {t("passwordSecured")}
                  </div>
                )
              )}
            </div>

            {/* Send Secure Invite */}
            <InviteVendorModal
              vendorId={vendorAssessment.id}
              vendorName={vendorAssessment.name}
              prefillEmail={v?.securityOfficerEmail || vendorAssessment.email}
              trigger={
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 px-4 gap-1.5"
                >
                  <SendHorizonal className="h-3.5 w-3.5" />
                  {t("sendSecureInvite")}
                </Button>
              }
            />

            <EditVendorProfileModal
              vendorId={vendorAssessment.id}
              companyId={companyId}
              initialData={modalInitialData}
              trigger={
                <Button 
                  variant={isComplete ? "outline" : "default"} 
                  size="sm" 
                  className={cn("shrink-0 h-9 px-4", !isComplete && "bg-indigo-600 hover:bg-indigo-700")}
                >
                  <Edit3 className="mr-2 h-3.5 w-3.5" />
                  {isComplete ? t("editProfile") : t("completeProfile")}
                </Button>
              }
            />
          </div>
        </div>

        {/* 2-Column Info Grid */}
        <div className="grid grid-cols-1 gap-x-12 gap-y-8 md:grid-cols-2">
          {/* Row 1: Location & Registration */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                <MapPin className="h-3 w-3" />
                {t("headquartersLocation")}
              </div>
              {v?.headquartersLocation ? (
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{v.headquartersLocation}</p>
              ) : (
                <div className="flex items-center gap-2 text-sm italic text-amber-500/70 dark:text-amber-400/50">
                  <AlertCircle className="h-3 w-3 fill-amber-500/20" />
                  {t("missingLocation")}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                <Fingerprint className="h-3 w-3" />
                {t("registration")}
              </div>
              {v?.registrationId ? (
                <Badge variant="outline" className="h-6 font-mono text-xs text-slate-700 dark:text-slate-300">
                  {v.registrationId}
                </Badge>
              ) : (
                <div className="flex items-center gap-2 text-sm italic text-red-500/70 dark:text-red-400/50">
                  <AlertCircle className="h-3 w-3 fill-red-500/20" />
                  {t("missingId")}
                </div>
              )}
            </div>
          </div>

          {/* Row 2: Security & Privacy */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                <ShieldCheck className="h-3 w-3" />
                {t("securityContact")}
              </div>
              {renderContact(v?.securityOfficerName || undefined, v?.securityOfficerEmail || undefined, t("securityContact"))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                <UserRoundCheck className="h-3 w-3" />
                {t("privacyDpo")}
              </div>
              {renderContact(v?.dpoName || undefined, v?.dpoEmail || undefined, t("privacyDpo"))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
