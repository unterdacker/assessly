import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Mail, ShieldCheck, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { requirePageRole } from "@/lib/auth/server";
import { MailSettingsForm } from "@/components/mail-settings-form";
import type { MailSettingsInitialData } from "@/components/mail-settings-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mail Settings — Assessly",
  description: "Configure email delivery strategy, SMTP credentials, and Resend API key.",
};

type PageProps = {
  params: Promise<{ locale: string }>;
};

export default async function MailSettingsPage({ params }: PageProps) {
  const { locale } = await params;
  await requirePageRole(["SUPER_ADMIN", "ADMIN"], locale);
  const t = await getTranslations();

  const settings = await prisma.systemSettings.findUnique({
    where: { id: "singleton" },
  });

  const initial: MailSettingsInitialData = {
    mailStrategy: settings?.mailStrategy ?? "LOG",
    mailFrom: settings?.mailFrom ?? null,
    mailFromName: settings?.mailFromName ?? null,
    smtpHost: settings?.smtpHost ?? null,
    smtpPort: settings?.smtpPort ?? null,
    smtpUser: settings?.smtpUser ?? null,
    // Never expose encrypted secrets to the client — only signal whether they exist.
    hasSmtpPassword: !!settings?.smtpPassword,
    hasResendApiKey: !!settings?.resendApiKey,
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* ── Breadcrumb ── */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-muted-foreground">
        <Link href={`/${locale}/settings`} className="hover:text-foreground transition-colors">
          {t("Settings")}
        </Link>
        <ChevronRight className="h-3 w-3" aria-hidden />
        <span className="text-foreground font-medium">{t("MailSettingsTitle")}</span>
      </nav>

      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Mail className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
            {t("MailSettingsTitle")}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t("MailSettingsDesc")}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
            AES-256-GCM encrypted
          </div>
          <Badge variant="outline" className="text-xs">
            ISO 27001 · CONFIG
          </Badge>
        </div>
      </div>

      <MailSettingsForm initial={initial} />
    </div>
  );
}
