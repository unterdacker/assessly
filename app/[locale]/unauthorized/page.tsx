import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getOptionalAuthSession } from "@/lib/auth/server";
import { getRoleLandingPath } from "@/lib/auth/permissions";

type UnauthorizedPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function UnauthorizedPage({ params }: UnauthorizedPageProps) {
  const { locale } = await params;
  const session = await getOptionalAuthSession();
  const returnPath = session ? `/${locale}${getRoleLandingPath(session.role)}` : `/${locale}/auth/sign-in`;

  return (
    <main className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-3xl items-center justify-center px-6 py-12">
      <div className="w-full rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-950/40">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300">
          <ShieldAlert className="h-6 w-6" aria-hidden />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Unauthorized</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Your current role does not have access to this route. AVRA blocks the request before any protected data is returned.
        </p>
        <div className="mt-6">
          <Button asChild>
            <Link href={returnPath}>Return to workspace</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}