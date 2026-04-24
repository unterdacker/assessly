import { checkLicense } from "@/lib/license/gate";

interface LicenseStatusBannerProps {
  companyId: string | null;
}

export async function LicenseStatusBanner(_props: LicenseStatusBannerProps) {
  const check = await checkLicense();

  if (check.status === "missing" || check.allowed) return null;

  return (
    <div
      role="alert"
      className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-center"
    >
      <p className="text-sm text-amber-800">
        <strong>License issue:</strong> {check.reason}
        {check.status === "expired" && (
          <> — <a href="https://venshield.com/pricing" className="underline hover:no-underline" rel="noopener noreferrer">Renew now</a></>
        )}
      </p>
    </div>
  );
}
