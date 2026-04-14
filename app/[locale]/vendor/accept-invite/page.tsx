import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { VendorAcceptInviteForm } from "@/components/vendor-accept-invite-form";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return {
    other: { "cache-control": "no-store, no-cache" },
  };
}

export default async function VendorAcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const t = await getTranslations("vendorAcceptInvite");

  return (
    <main className="flex min-h-[calc(100vh-8rem)] flex-col items-center justify-center p-4 sm:p-8 md:p-12 lg:p-16">
      <div className="w-full max-w-sm rounded-xl border bg-card text-card-foreground shadow-sm">
        <div className="flex flex-col space-y-1.5 p-6 pb-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-indigo-600 mb-4">
            <span className="text-xl font-bold text-white">V</span>
          </div>
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
            {t("pageSubtitle", { defaultMessage: "Create a secure password to access your assessment portal" })}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {t("pageTitle", { defaultMessage: "Set Your Password" })}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("pageSubtitle", { defaultMessage: "Create a secure password to access your assessment portal" })}
          </p>
        </div>
        <div className="p-6 pt-0">
          <Suspense fallback={<div className="h-64 animate-pulse rounded-md bg-muted" />}>
            <VendorAcceptInviteForm token={token} />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
