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
import { updateVendorProfile } from "@/app/actions/update-vendor-profile";
import {
  getCustomVendorServiceTypes,
  saveCustomVendorServiceType,
} from "@/app/actions/custom-vendor-service-types";
import { toast } from "sonner";

const vendorProfileSchema = z.object({
  officialName: z.string().optional(),
  registrationId: z.string().optional(),
  vendorServiceType: z.string().optional(),
  vendorServiceTypeCustom: z.string().optional(),
  securityOfficerName: z.string().optional(),
  securityOfficerEmail: z.string().email("Invalid email").optional().or(z.literal("")),
  dpoName: z.string().optional(),
  dpoEmail: z.string().email("Invalid email").optional().or(z.literal("")),
  headquartersLocation: z.string().optional(),
  sizeClassification: z.string().optional(),
});

type VendorProfileForm = z.infer<typeof vendorProfileSchema>;

const PREDEFINED_VENDOR_SERVICE_TYPES = [
  "Cloud Service Provider (SaaS/PaaS/IaaS)",
  "Managed Security Service Provider (MSSP)",
  "IT-Infrastructure & Maintenance",
  "Software / Application Development",
  "Data Processing & Analytics",
  "Professional Services (Legal/HR)",
  "Other (Custom)",
];

type EditVendorProfileModalProps = {
  vendorId: string;
  companyId: string;
  initialData: {
    officialName?: string | null;
    registrationId?: string | null;
    vendorServiceType?: string | null;
    vendorServiceTypeCustom?: string | null;
    securityOfficerName?: string | null;
    securityOfficerEmail?: string | null;
    dpoName?: string | null;
    dpoEmail?: string | null;
    headquartersLocation?: string | null;
    sizeClassification?: string | null;
  };
  trigger: React.ReactNode;
};

export function EditVendorProfileModal({
  vendorId,
  companyId,
  initialData,
  trigger,
}: EditVendorProfileModalProps) {
  const [open, setOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [customServiceTypes, setCustomServiceTypes] = React.useState<string[]>([]);

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
      vendorServiceTypeCustom: initialData.vendorServiceTypeCustom || "",
      securityOfficerName: initialData.securityOfficerName || "",
      securityOfficerEmail: initialData.securityOfficerEmail || "",
      dpoName: initialData.dpoName || "",
      dpoEmail: initialData.dpoEmail || "",
      headquartersLocation: initialData.headquartersLocation || "",
      sizeClassification: initialData.sizeClassification || "",
    },
  });

  const vendorServiceType = watch("vendorServiceType");
  const vendorServiceTypeCustom = watch("vendorServiceTypeCustom");
  const isOtherSelected = vendorServiceType === "Other (Custom)";

  // Merge predefined and custom service types
  const allServiceTypes = React.useMemo(() => {
    const predefinedList = PREDEFINED_VENDOR_SERVICE_TYPES.filter(
      (t) => t !== "Other (Custom)"
    );
    return [...predefinedList, ...customServiceTypes, "Other (Custom)"];
  }, [customServiceTypes]);

  const onSubmit = async (data: VendorProfileForm) => {
    setIsSubmitting(true);
    try {
      // Validate that custom input is provided if "Other" is selected
      if (isOtherSelected && !data.vendorServiceTypeCustom?.trim()) {
        toast.error("Please provide a custom service type when selecting 'Other'.");
        setIsSubmitting(false);
        return;
      }

      // If a custom type was entered, save it to the database
      if (isOtherSelected && data.vendorServiceTypeCustom?.trim()) {
        const customTypeResult = await saveCustomVendorServiceType({
          companyId,
          name: data.vendorServiceTypeCustom.trim(),
        });

        if (customTypeResult.success && customTypeResult.created) {
          // Add to local state so it appears in dropdown for future use
          setCustomServiceTypes((prev) => {
            if (!prev.includes(data.vendorServiceTypeCustom!.trim())) {
              return [...prev, data.vendorServiceTypeCustom!.trim()];
            }
            return prev;
          });
          toast.success(
            `Custom service type "${data.vendorServiceTypeCustom}" saved for future use!`
          );
        }
      }

      const result = await updateVendorProfile({
        vendorId,
        ...data,
      });
      if (result.success) {
        toast.success("Vendor profile updated successfully.");
        setOpen(false);
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      toast.error("An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  React.useEffect(() => {
    if (open) {
      // Fetch custom service types when modal opens
      getCustomVendorServiceTypes(companyId).then((types) => {
        setCustomServiceTypes(types);
      });

      reset({
        officialName: initialData.officialName || "",
        registrationId: initialData.registrationId || "",
        vendorServiceType: initialData.vendorServiceType || "",
        vendorServiceTypeCustom: initialData.vendorServiceTypeCustom || "",
        securityOfficerName: initialData.securityOfficerName || "",
        securityOfficerEmail: initialData.securityOfficerEmail || "",
        dpoName: initialData.dpoName || "",
        dpoEmail: initialData.dpoEmail || "",
        headquartersLocation: initialData.headquartersLocation || "",
        sizeClassification: initialData.sizeClassification || "",
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="vendorServiceType">Vendor Service Type</Label>
                <Select
                  value={vendorServiceType}
                  onValueChange={(value) => {
                    setValue("vendorServiceType", value);
                    // Clear custom input if not "Other"
                    if (value !== "Other (Custom)") {
                      setValue("vendorServiceTypeCustom", "");
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select service type" />
                  </SelectTrigger>
                  <SelectContent>
                    {allServiceTypes.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {isOtherSelected && (
                <div className="space-y-2">
                  <Label htmlFor="vendorServiceTypeCustom">Custom Service Type</Label>
                  <Input
                    id="vendorServiceTypeCustom"
                    {...register("vendorServiceTypeCustom")}
                    placeholder="e.g., AI Model Provider"
                  />
                  {errors.vendorServiceTypeCustom && (
                    <p className="text-sm text-red-600">{errors.vendorServiceTypeCustom.message}</p>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="sizeClassification">Size Classification</Label>
                  <div className="group relative">
                    <HelpCircle className="h-4 w-4 text-slate-400 cursor-help" />
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                      Helps determine the vendor's own regulatory obligations under NIS2 Article 2.
                    </div>
                  </div>
                </div>
                <Select
                  value={watch("sizeClassification")}
                  onValueChange={(value) => setValue("sizeClassification", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select size" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SME">SME (Small/Medium Enterprise)</SelectItem>
                    <SelectItem value="Large Enterprise">Large Enterprise</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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