"use client";

import { ThemeProvider } from "@/components/theme-provider";
import { DashboardShell } from "@/components/dashboard-shell";
import { Toaster } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <DashboardShell>{children}</DashboardShell>
      <Toaster />
    </ThemeProvider>
  );
}
