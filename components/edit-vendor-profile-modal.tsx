"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import { useRouter } from "next/navigation";
import { ServiceTypeCombobox } from "@/components/ui/service-type-combobox";
import { updateVendorProfile } from "@/app/actions/update-vendor-profile";
import { getUniqueServiceTypes } from "@/app/actions/get-unique-service-types";
import { toast } from "sonner";

type VendorProfileForm = {
  officialName?: string;
  registrationId?: string;
  vendorServiceType?: string;
  securityOfficerName?: string;
  securityOfficerEmail?: string;
  dpoName?: string;
  dpoEmail?: string;
  headquartersLocation?: string;
};

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
  const t = useTranslations("assessment.editProfileModal");
  const vendorProfileSchema = React.useMemo(
    () =>
      z.object({
        officialName: z.string().optional(),
        registrationId: z.string().optional(),
        vendorServiceType: z.string().optional(),
        securityOfficerName: z.string().optional(),
        securityOfficerEmail: z.string().email(t("validation.invalidEmail")).optional().or(z.literal("")),
        dpoName: z.string().optional(),
        dpoEmail: z.string().email(t("validation.invalidEmail")).optional().or(z.literal("")),
        headquartersLocation: z.string().optional(),
      }),
    [t],
  );
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
        toast.success(t("toastSuccess"));
        router.refresh();
        setOpen(false);
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error(t("toastUnexpectedError"));
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
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {t("description")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Primary Information */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{t("sections.primaryInformation")}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="officialName">{t("fields.officialName.label")}</Label>
                <Input
                  id="officialName"
                  {...register("officialName")}
                  placeholder={t("fields.officialName.placeholder")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="registrationId">{t("fields.registrationId.label")}</Label>
                <Input
                  id="registrationId"
                  {...register("registrationId")}
                  placeholder={t("fields.registrationId.placeholder")}
                />
              </div>
            </div>
          </div>

          {/* Supply Chain Classification */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{t("sections.supplyChainClassification")}</h3>
            <div className="space-y-2">
              <Label htmlFor="vendorServiceType">{t("fields.vendorServiceType.label")}</Label>
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
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{t("sections.locationInformation")}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="headquartersLocation">{t("fields.headquartersLocation.label")}</Label>
                <Input
                  id="headquartersLocation"
                  {...register("headquartersLocation")}
                  placeholder={t("fields.headquartersLocation.placeholder")}
                />
              </div>
            </div>
          </div>

          {/* Security Contacts */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{t("sections.securityContacts")}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="securityOfficerName">{t("fields.securityOfficerName.label")}</Label>
                <Input
                  id="securityOfficerName"
                  {...register("securityOfficerName")}
                  placeholder={t("fields.securityOfficerName.placeholder")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="securityOfficerEmail">{t("fields.securityOfficerEmail.label")}</Label>
                <Input
                  id="securityOfficerEmail"
                  {...register("securityOfficerEmail")}
                  type="email"
                  placeholder={t("fields.securityOfficerEmail.placeholder")}
                />
                {errors.securityOfficerEmail && (
                  <p className="text-sm text-red-600">{errors.securityOfficerEmail.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="dpoName">{t("fields.dpoName.label")}</Label>
                <Input
                  id="dpoName"
                  {...register("dpoName")}
                  placeholder={t("fields.dpoName.placeholder")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dpoEmail">{t("fields.dpoEmail.label")}</Label>
                <Input
                  id="dpoEmail"
                  {...register("dpoEmail")}
                  type="email"
                  placeholder={t("fields.dpoEmail.placeholder")}
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
              {t("actions.cancel")}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? t("actions.saving") : t("actions.saveChanges")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}