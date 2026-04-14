import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { VendorMfaVerifyForm } from "@/components/vendor-mfa-verify-form";
import { getVendorMfaPendingClaims } from "@/lib/auth/vendor-mfa-pending";
import { getOptionalAuthSession } from "@/lib/auth/server";

type Props = { params: Promise<{ locale: string }> };

export default async function VendorMfaVerifyPage({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations("VendorMfaVerify");

  // If already authenticated, redirect to vendor portal.
  const session = await getOptionalAuthSession();
  if (session) {
    redirect(`/${locale}/external/portal`);
  }

  // Guard: must have valid vendor-mfa-pending cookie.
  const claims = await getVendorMfaPendingClaims();
  if (!claims) {
    redirect(`/${locale}/external/portal`);
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-5xl items-center px-6 py-12">
      <div className="grid w-full gap-10 md:grid-cols-[1.1fr_0.9fr] md:items-center">
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {t("title")}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            {t("heading")}
          </h1>
          <p className="max-w-xl text-sm leading-6 text-muted-foreground md:text-base">
            {t("description")}
          </p>
        </div>
        <VendorMfaVerifyForm locale={locale} />
      </div>
    </main>
  );
}
