"use client";

import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "sonner";
import { AuthSessionProvider, type ClientAuthSession } from "@/lib/auth/client";

export function Providers({
  children,
  session,
  nonce,
}: {
  children: React.ReactNode;
  session: ClientAuthSession;
  nonce?: string;
}) {
  return (
    <AuthSessionProvider session={session}>
      <ThemeProvider nonce={nonce}>
        {children}
        <Toaster />
      </ThemeProvider>
    </AuthSessionProvider>
  );
}
