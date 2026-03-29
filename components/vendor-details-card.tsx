"use client";

import * as React from "react";
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
  Check
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EditVendorProfileModal } from "@/components/edit-vendor-profile-modal";
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
  const v = vendorAssessment.vendor;
  const [hasCopied, setHasCopied] = React.useState(false);
  const [hasCopiedCode, setHasCopiedCode] = React.useState(false);

  const progressPercent = calculateDossierCompletion(v);
  const isComplete = progressPercent === 100;
  const hasActiveCode = Boolean(vendorAssessment.isCodeActive && vendorAssessment.accessCode);

  const formatAccessCodeExpiry = (value: string | null) => {
    if (!value) return "No active code";
    const expiresAt = new Date(value);
    if (!Number.isFinite(expiresAt.getTime())) return "No active code";
    if (expiresAt.getTime() <= Date.now()) return "Expired";

    const formatted = new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(expiresAt);

    return `Expires: ${formatted}`;
  };

  const handleInvite = async () => {
    if (!hasActiveCode || !vendorAssessment.accessCode) {
      window.alert("Generate an access code first.");
      return;
    }

    try {
      const message = `Please complete your security assessment here: ${window.location.origin}/portal. Your secure Access Code is: ${vendorAssessment.accessCode}`;
      await navigator.clipboard.writeText(message);
      setHasCopied(true);
      window.setTimeout(() => setHasCopied(false), 2500);
    } catch (err) {
      console.error("Invite error:", err);
      window.alert("Copy failed. Please copy the access code manually.");
    }
  };

  const handleCopyCodeOnly = async () => {
    if (!vendorAssessment.accessCode) return;
    try {
      await navigator.clipboard.writeText(vendorAssessment.accessCode);
      setHasCopiedCode(true);
      window.setTimeout(() => setHasCopiedCode(false), 1200);
    } catch {
      window.alert("Copy failed. Please copy the code manually.");
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
          Missing {label} Contact
        </div>
      );
    }

    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-slate-700 dark:text-slate-200">
        <span>{name || <span className="text-amber-500/70 dark:text-amber-400/50">Missing Name ⚠️</span>}</span>
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
            Missing Email ⚠️
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
                  Dossier Fully Verified
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                    Dossier {progressPercent}% complete
                  </span>
                  <div className="h-1 w-24 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div className="h-full bg-indigo-500" style={{ width: `${progressPercent}%` }} />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-col items-start gap-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
              {hasActiveCode ? (
                <>
                  <div className="inline-flex items-center gap-2 text-xs font-semibold tracking-wider text-slate-900 dark:text-slate-100">
                    <span>{vendorAssessment.accessCode}</span>
                    <button
                      type="button"
                      aria-label={`Copy access code for ${vendorAssessment.name}`}
                      onClick={handleCopyCodeOnly}
                      className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    {hasCopiedCode && (
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400">Copied</span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {formatAccessCodeExpiry(vendorAssessment.codeExpiresAt)}
                  </p>
                </>
              ) : (
                <>
                  <span className="text-xs text-muted-foreground">No active code</span>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Generate a code to invite this vendor.</p>
                </>
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleInvite}
              disabled={!hasActiveCode}
              className={cn(
                "h-9 px-4 transition-all",
                hasCopied ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "text-slate-600"
              )}
              title={hasActiveCode ? "Copy portal invite message" : "Generate an access code first"}
            >
              {hasCopied ? (
                <>
                  <Check className="mr-2 h-3.5 w-3.5" />
                  Invite Copied
                </>
              ) : (
                <>
                  <Copy className="mr-2 h-3.5 w-3.5" />
                  Invite Vendor
                </>
              )}
            </Button>

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
                  {isComplete ? "Edit Profile" : "Complete Profile"}
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
                Headquarters Location
              </div>
              {v?.headquartersLocation ? (
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{v.headquartersLocation}</p>
              ) : (
                <div className="flex items-center gap-2 text-sm italic text-amber-500/70 dark:text-amber-400/50">
                  <AlertCircle className="h-3 w-3 fill-amber-500/20" />
                  Missing Location
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                <Fingerprint className="h-3 w-3" />
                Registration (VAT/ID)
              </div>
              {v?.registrationId ? (
                <Badge variant="outline" className="h-6 font-mono text-xs text-slate-700 dark:text-slate-300">
                  {v.registrationId}
                </Badge>
              ) : (
                <div className="flex items-center gap-2 text-sm italic text-red-500/70 dark:text-red-400/50">
                  <AlertCircle className="h-3 w-3 fill-red-500/20" />
                  Missing ID
                </div>
              )}
            </div>
          </div>

          {/* Row 2: Security & Privacy */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                <ShieldCheck className="h-3 w-3" />
                Security Contact
              </div>
              {renderContact(v?.securityOfficerName || undefined, v?.securityOfficerEmail || undefined, "Security")}
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                <UserRoundCheck className="h-3 w-3" />
                Privacy / DPO
              </div>
              {renderContact(v?.dpoName || undefined, v?.dpoEmail || undefined, "DPO")}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
