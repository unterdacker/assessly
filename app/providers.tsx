"use client";

import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
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
        <TooltipProvider delayDuration={300}>
          <AiModeProvider aiDisabled={aiDisabled}>{children}</AiModeProvider>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </AuthSessionProvider>
  );
}
