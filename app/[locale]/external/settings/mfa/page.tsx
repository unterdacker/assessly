import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { MfaSettings } from "@/components/mfa-settings";
import { requireAuthSession } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";

type Props = { params: Promise<{ locale: string }> };

export default async function VendorMfaSettingsPage({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations("VendorMfaSettings");

  let session;
  try {
    session = await requireAuthSession();
  } catch {
    redirect(`/${locale}/auth/sign-in`);
  }

  if (session.role !== "VENDOR") {
    redirect(`/${locale}/auth/sign-in`);
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { mfaEnabled: true, mfaRecoveryCodes: true },
  });

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-12">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("description")}
        </p>
      </div>
      <MfaSettings
        mfaEnabled={user?.mfaEnabled ?? false}
        hasRecoveryCodes={Boolean(user?.mfaRecoveryCodes?.length)}
      />
    </main>
  );
}
