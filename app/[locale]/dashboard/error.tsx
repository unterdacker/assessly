"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Intentional: full error logged to browser console for authenticated staff users only.
  // Never expose error.message or error.stack in the rendered UI.
  useEffect(() => {
    console.error("[DashboardError]", error);
  }, [error]);

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-destructive/10">
        <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden />
      </div>
      <div className="space-y-1">
        <p className="font-semibold text-base text-foreground">
          Dashboard failed to load
        </p>
        <p className="text-sm text-muted-foreground">
          An error occurred while loading your dashboard data.
          {error.digest && (
            <span className="block font-mono text-xs opacity-60 mt-1">
              ref: {error.digest}
            </span>
          )}
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
