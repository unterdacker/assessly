import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getAuthSession } from "@/lib/auth/server";
import { OidcSettingsForm } from "@/components/oidc-settings-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "SSO Settings - Assessly",
  description: "Configure OpenID Connect settings for internal login.",
};

type PageProps = {
  params: Promise<{ locale: string }>;
};

export default async function SsoSettingsPage({ params }: PageProps) {
  const { locale } = await params;
  let session;
  try {
    session = await getAuthSession();
  } catch {
    redirect(`/${locale}/settings`);
  }

  if (session.role !== "ADMIN" || !session.companyId) {
    redirect(`/${locale}/settings`);
  }

  const [t, config] = await Promise.all([
    getTranslations("OidcSettings"),
    prisma.oidcConfig.findUnique({ where: { companyId: session.companyId } }),
  ]);

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground mt-1">{t("description")}</p>
      </div>

      <OidcSettingsForm
        locale={locale}
        config={config ? {
          isEnabled: config.isEnabled,
          issuerUrl: config.issuerUrl,
          clientId: config.clientId,
          hasClientSecret: !!config.clientSecretEncrypted,
          jitProvisioning: config.jitProvisioning,
          jitAllowedEmailDomains: config.jitAllowedEmailDomains,
        } : null}
      />
    </div>
  );
}
