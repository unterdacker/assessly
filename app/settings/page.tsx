import { ShieldCheck, Server, Globe, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AiSettingsForm } from "@/components/ai-settings-form";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const company = await prisma.company.findUnique({
    where: { slug: "default" },
  });

  if (!company) {
    return <div>Company not found</div>; // Or redirect
  }

  const isLocal = company.aiProvider === "local";

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Organization Settings</h1>
        <p className="text-muted-foreground">Manage your workspace preferences and compliance parameters.</p>
      </div>

      <div className="grid gap-6">
        <AiSettingsForm company={company} companyId={company.id} />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              Current Data Residency
            </CardTitle>
            <CardDescription>
              Verify where your vendor data is actively processed during AI assessments.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center rounded-lg border p-4 bg-slate-50/50 dark:bg-slate-900/30">
              <div className="space-y-1">
                <p className="text-sm font-medium leading-none">AI Data Processing Location</p>
                <p className="text-sm text-muted-foreground">
                  Current environment routing for inference telemetry.
                </p>
              </div>

              <div className="flex flex-col items-end gap-2">
                {isLocal ? (
                  <Badge variant="outline" className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800">
                    <Server className="h-3.5 w-3.5" />
                    Data Processing: Local Instance
                  </Badge>
                ) : (
                  <Badge variant="outline" className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800">
                    <Globe className="h-3.5 w-3.5" />
                    Data Processing: France (Mistral EU)
                  </Badge>
                )}
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                  Provider: {company.aiProvider}
                </span>
              </div>
            </div>

            <p className="text-xs text-muted-foreground mt-4 leading-relaxed">
              Your active workspace is configured to route vendor evidence strictly to the designated endpoint above.
              {isLocal
                ? " Air-gapped internal telemetry guarantees zero EU-egress."
                : " Enterprise agreements ensure strict EU data residency alignment via Mistral platforms."}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
