"use client";

import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "sonner";
import { AuthSessionProvider, type ClientAuthSession } from "@/lib/auth/client";
import { AiModeProvider } from "@/lib/ai/ai-mode-context";

export function Providers({
  children,
  session,
  aiDisabled,
  nonce,
}: {
  children: React.ReactNode;
  session: ClientAuthSession;
  aiDisabled: boolean;
  nonce?: string;
}) {
  return (
    <AuthSessionProvider session={session}>
      <ThemeProvider nonce={nonce}>
        <AiModeProvider aiDisabled={aiDisabled}>{children}</AiModeProvider>
        <Toaster />
      </ThemeProvider>
    </AuthSessionProvider>
  );
}
