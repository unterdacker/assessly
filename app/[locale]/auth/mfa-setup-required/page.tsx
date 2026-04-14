import { redirect } from "next/navigation";
import { MfaSetupRequiredContent } from "@/components/mfa-setup-required-content";
import { getMfaSetupPendingClaims } from "@/lib/auth/mfa-setup-pending";

type MfaSetupRequiredPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function MfaSetupRequiredPage({ params }: MfaSetupRequiredPageProps) {
  const { locale } = await params;

  // Retrieve pending setup claims (must be implemented by Coder)
  const claims = await getMfaSetupPendingClaims();
  
  // If there are no claims indicating setup is required, send back to login
  if (!claims) {
    redirect(`/${locale}/auth/sign-in`);
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-5xl items-center justify-center px-6 py-12">
      <MfaSetupRequiredContent locale={locale} />
    </main>
  );
}