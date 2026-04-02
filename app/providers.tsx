"use client";

import { ThemeProvider } from "@/components/theme-provider";
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
        {children}
        <Toaster />
      </ThemeProvider>
    </AuthSessionProvider>
  );
}
