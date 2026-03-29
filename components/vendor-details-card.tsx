"use client";

import * as React from "react";
import { 
  MapPin, 
  ShieldCheck, 
  UserRoundCheck, 
  Fingerprint, 
  Mail, 
  Edit3,
  AlertCircle
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EditVendorProfileModal } from "@/components/edit-vendor-profile-modal";
import type { VendorAssessment } from "@/lib/vendor-assessment";

interface VendorDetailsCardProps {
  vendorAssessment: VendorAssessment;
  companyId: string;
}

/**
 * A persistent "Vendor Dossier" overview for the Assessment Workspace.
 * Displayed at the top of the page, providing instant context on the vendor's identity.
 * Includes a "Profile Incomplete" CTA state for vendors with missing metadata.
 */
export function VendorDetailsCard({ vendorAssessment, companyId }: VendorDetailsCardProps) {
  const v = vendorAssessment.vendor;

  // Check if any major detail is filled to decide on "Dossier" vs "Incomplete CTA" view.
  const isProfilePartiallyFilled = 
    Boolean(v?.officialName && v.officialName !== vendorAssessment.name) ||
    Boolean(v?.headquartersLocation) ||
    Boolean(v?.securityOfficerName) ||
    Boolean(v?.dpoName) ||
    Boolean(v?.registrationId);

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

  /**
   * CTA BOX: For incomplete profiles, show an engaging box rather than empty fields.
   */
  if (!isProfilePartiallyFilled) {
    return (
      <Card className="border-indigo-200 bg-indigo-50/50 dark:border-indigo-950 dark:bg-indigo-950/20">
        <CardContent className="flex flex-col items-center justify-between gap-4 p-6 sm:flex-row">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-900 dark:text-indigo-400">
              <AlertCircle className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h3 className="font-semibold text-indigo-900 dark:text-indigo-100">
                Vendor profile incomplete
              </h3>
              <p className="text-sm text-indigo-700/80 dark:text-indigo-300/60">
                Add headquarters, registration, and contact details to complete the vendor dossier.
              </p>
            </div>
          </div>
          <EditVendorProfileModal
            vendorId={vendorAssessment.id}
            companyId={companyId}
            initialData={modalInitialData}
            trigger={
              <Button variant="default" className="w-full sm:w-auto">
                <Edit3 className="mr-2 h-4 w-4" />
                Fill Vendor Dossier
              </Button>
            }
          />
        </CardContent>
      </Card>
    );
  }

  /**
   * DOSSIER CARD: The full read-only information grid.
   */
  return (
    <Card className="relative overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
      <CardContent className="p-6">
        {/* Header Section */}
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div className="min-w-0 space-y-1">
            <h2 className="truncate text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              {v?.officialName || vendorAssessment.name}
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground mr-1">
                {vendorAssessment.serviceType}
              </span>
              {v?.registrationId && (
                <Badge variant="outline" className="h-5 px-1.5 font-mono text-[10px] text-slate-500">
                  <Fingerprint className="mr-1 h-3 w-3" />
                  {v.registrationId}
                </Badge>
              )}
            </div>
          </div>

          <EditVendorProfileModal
            vendorId={vendorAssessment.id}
            companyId={companyId}
            initialData={modalInitialData}
            trigger={
              <Button variant="outline" size="sm" className="shrink-0 h-9">
                <Edit3 className="mr-2 h-3.5 w-3.5" />
                Edit Profile
              </Button>
            }
          />
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {/* Geography */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              <MapPin className="h-3 w-3" />
              Geography
            </div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {v?.headquartersLocation || <span className="text-slate-300 dark:text-slate-700">—</span>}
            </p>
          </div>

          {/* Security Contact */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              <ShieldCheck className="h-3 w-3" />
              Security Contact
            </div>
            {v?.securityOfficerName ? (
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {v.securityOfficerName}
                </p>
                {v.securityOfficerEmail && (
                  <a 
                    href={`mailto:${v.securityOfficerEmail}`}
                    className="flex items-center gap-1.5 text-xs text-indigo-600 hover:underline dark:text-indigo-400"
                  >
                    <Mail className="h-3 w-3" />
                    {v.securityOfficerEmail}
                  </a>
                )}
              </div>
            ) : (
              <p className="text-sm italic text-slate-300 dark:text-slate-700">Not provided</p>
            )}
          </div>

          {/* DPO */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              <UserRoundCheck className="h-3 w-3" />
              Privacy / DPO
            </div>
            {v?.dpoName ? (
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {v.dpoName}
                </p>
                {v.dpoEmail && (
                  <a 
                    href={`mailto:${v.dpoEmail}`}
                    className="flex items-center gap-1.5 text-xs text-indigo-600 hover:underline dark:text-indigo-400"
                  >
                    <Mail className="h-3 w-3" />
                    {v.dpoEmail}
                  </a>
                )}
              </div>
            ) : (
              <p className="text-sm italic text-slate-300 dark:text-slate-700">Not assigned</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
