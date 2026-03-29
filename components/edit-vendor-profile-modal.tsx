"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { HelpCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRouter } from "next/navigation";
import { ServiceTypeCombobox } from "@/components/ui/service-type-combobox";
import { updateVendorProfile } from "@/app/actions/update-vendor-profile";
import { getUniqueServiceTypes } from "@/app/actions/get-unique-service-types";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Schema — vendorServiceType is now a plain string; no separate "custom" field
// ---------------------------------------------------------------------------
const vendorProfileSchema = z.object({
  officialName: z.string().optional(),
  registrationId: z.string().optional(),
  vendorServiceType: z.string().optional(),
  securityOfficerName: z.string().optional(),
  securityOfficerEmail: z.string().email("Invalid email").optional().or(z.literal("")),
  dpoName: z.string().optional(),
  dpoEmail: z.string().email("Invalid email").optional().or(z.literal("")),
  headquartersLocation: z.string().optional(),
});

type VendorProfileForm = z.infer<typeof vendorProfileSchema>;

type EditVendorProfileModalProps = {
  vendorId: string;
  companyId: string;
  initialData: {
    officialName?: string | null;
    registrationId?: string | null;
    vendorServiceType?: string | null;
    securityOfficerName?: string | null;
    securityOfficerEmail?: string | null;
    dpoName?: string | null;
    dpoEmail?: string | null;
    headquartersLocation?: string | null;
  };
  trigger: React.ReactNode;
};

export function EditVendorProfileModal({
  vendorId,
  companyId,
  initialData,
  trigger,
}: EditVendorProfileModalProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  /** Unique service types collected from existing vendor records in the DB. */
  const [existingServiceTypes, setExistingServiceTypes] = React.useState<string[]>([]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<VendorProfileForm>({
    resolver: zodResolver(vendorProfileSchema),
    defaultValues: {
      officialName: initialData.officialName || "",
      registrationId: initialData.registrationId || "",
      vendorServiceType: initialData.vendorServiceType || "",
      securityOfficerName: initialData.securityOfficerName || "",
      securityOfficerEmail: initialData.securityOfficerEmail || "",
      dpoName: initialData.dpoName || "",
      dpoEmail: initialData.dpoEmail || "",
      headquartersLocation: initialData.headquartersLocation || "",
    },
  });

  const vendorServiceType = watch("vendorServiceType");

  const onSubmit = async (data: VendorProfileForm) => {
    setIsSubmitting(true);
    try {
      const result = await updateVendorProfile({
        vendorId,
        ...data,
      });
      if (result.success) {
        toast.success("Vendor profile updated successfully.");
        router.refresh();
        setOpen(false);
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  React.useEffect(() => {
    if (open) {
      // Pull every unique type already used across this company's vendors.
      // This is the "learn-as-you-go" read: no hardcoded list needed.
      getUniqueServiceTypes(companyId).then(setExistingServiceTypes);

      reset({
        officialName: initialData.officialName || "",
        registrationId: initialData.registrationId || "",
        vendorServiceType: initialData.vendorServiceType || "",
        securityOfficerName: initialData.securityOfficerName || "",
        securityOfficerEmail: initialData.securityOfficerEmail || "",
        dpoName: initialData.dpoName || "",
        dpoEmail: initialData.dpoEmail || "",
        headquartersLocation: initialData.headquartersLocation || "",
      });
    }
  }, [open, initialData, reset, companyId]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-visible">
        <DialogHeader>
          <DialogTitle>Edit Vendor Profile</DialogTitle>
          <DialogDescription>
            Update NIS2-relevant vendor information for audit trails and compliance tracking.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Primary Information */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Primary Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="officialName">Official Company Name</Label>
                <Input
                  id="officialName"
                  {...register("officialName")}
                  placeholder="e.g., Acme Corp Ltd"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="registrationId">Registration ID (VAT/Tax No.)</Label>
                <Input
                  id="registrationId"
                  {...register("registrationId")}
                  placeholder="e.g., GB123456789"
                />
              </div>
            </div>
          </div>

          {/* Supply Chain Classification */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Supply Chain Classification</h3>
            <div className="space-y-2">
              <Label htmlFor="vendorServiceType">Vendor Service Type</Label>
              {/* Learn-as-you-go combobox: options come from existing vendor records.
                  Typing an unknown value shows a "Create new: …" option. */}
              <ServiceTypeCombobox
                id="vendorServiceType"
                value={vendorServiceType || ""}
                onChange={(value) => setValue("vendorServiceType", value)}
                options={existingServiceTypes}
              />
            </div>
          </div>

          {/* Location Information */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Location Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="headquartersLocation">Headquarters Location</Label>
                <Input
                  id="headquartersLocation"
                  {...register("headquartersLocation")}
                  placeholder="e.g., London, UK"
                />
              </div>
            </div>
          </div>

          {/* Security Contacts */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Security Contacts</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="securityOfficerName">Primary Security Officer Name</Label>
                <Input
                  id="securityOfficerName"
                  {...register("securityOfficerName")}
                  placeholder="e.g., John Doe"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="securityOfficerEmail">Security Officer Email</Label>
                <Input
                  id="securityOfficerEmail"
                  {...register("securityOfficerEmail")}
                  type="email"
                  placeholder="security@company.com"
                />
                {errors.securityOfficerEmail && (
                  <p className="text-sm text-red-600">{errors.securityOfficerEmail.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="dpoName">Data Protection Officer (DPO) Name</Label>
                <Input
                  id="dpoName"
                  {...register("dpoName")}
                  placeholder="e.g., Jane Smith"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dpoEmail">DPO Email</Label>
                <Input
                  id="dpoEmail"
                  {...register("dpoEmail")}
                  type="email"
                  placeholder="dpo@company.com"
                />
                {errors.dpoEmail && (
                  <p className="text-sm text-red-600">{errors.dpoEmail.message}</p>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}