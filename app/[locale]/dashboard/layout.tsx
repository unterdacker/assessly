import { LicenseStatusBanner } from "@/components/license-status-banner";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <LicenseStatusBanner companyId={null} />
      {children}
    </>
  );
}
