"use client";

import { ThemeProvider } from "@/components/theme-provider";
import { DashboardShell } from "@/components/dashboard-shell";
import { Toaster } from "sonner";
import { AuthSessionProvider, type ClientAuthSession } from "@/lib/auth/client";

export function Providers({
  children,
  session,
}: {
  children: React.ReactNode;
  session: ClientAuthSession;
}) {
  return (
    <AuthSessionProvider session={session}>
      <ThemeProvider>
        <DashboardShell>{children}</DashboardShell>
        <Toaster />
      </ThemeProvider>
    </AuthSessionProvider>
  );
}
