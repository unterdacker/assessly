"use client";

import * as React from "react";
import { useActionState, useTransition } from "react";
import { toast } from "sonner";
import {
  Mail,
  Server,
  Zap,
  Terminal,
  ShieldCheck,
  Send,
  Eye,
  EyeOff,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { updateMailSettings, testMailConfig } from "@/app/actions/mail-settings";

// ─── Types ────────────────────────────────────────────────────────────────────

export type MailSettingsInitialData = {
  mailStrategy: "SMTP" | "RESEND" | "LOG";
  mailFrom: string | null;
  mailFromName: string | null;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  hasSmtpPassword: boolean;
  hasResendApiKey: boolean;
};

type ActionResult = { ok: boolean; error?: string; message?: string } | null;

// ─── PasswordInput ────────────────────────────────────────────────────────────

function PasswordInput({
  id,
  name,
  placeholder,
  disabled,
  autoComplete = "off",
}: {
  id: string;
  name: string;
  placeholder?: string;
  disabled?: boolean;
  autoComplete?: string;
}) {
  const [visible, setVisible] = React.useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        name={name}
        type={visible ? "text" : "password"}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete={autoComplete}
        className="pr-10"
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={visible ? "Hide" : "Show"}
        onClick={() => setVisible((v) => !v)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

// ─── StrategyBadge ────────────────────────────────────────────────────────────

function StrategyBadge({ strategy }: { strategy: string }) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
    SMTP: { label: "SMTP", variant: "default" },
    RESEND: { label: "Resend", variant: "default" },
    LOG: { label: "Log (dev)", variant: "secondary" },
  };
  const s = map[strategy] ?? map.LOG;
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

// ─── Main Form Component ──────────────────────────────────────────────────────

export function MailSettingsForm({ initial }: { initial: MailSettingsInitialData }) {
  const [strategy, setStrategy] = React.useState(initial.mailStrategy);
  const [testEmail, setTestEmail] = React.useState("");
  const [testPending, startTestTransition] = useTransition();

  const [saveState, saveAction, savePending] = useActionState(
    async (prev: ActionResult, formData: FormData) => {
      const result = await updateMailSettings(prev, formData);
      if (result.ok) {
        toast.success("Mail settings saved successfully.");
      } else {
        toast.error(result.error ?? "Failed to save mail settings.");
      }
      return result;
    },
    null,
  );

  function handleTest() {
    if (!testEmail) {
      toast.warning("Enter a recipient email address to send a test.");
      return;
    }

    const form = document.getElementById("mail-settings-form") as HTMLFormElement | null;
    if (!form) return;

    startTestTransition(async () => {
      const formData = new FormData(form);
      formData.set("strategy", strategy);
      formData.set("testEmail", testEmail);

      const result = await testMailConfig(null, formData);
      if (result.ok) {
        toast.success(result.message ?? "Test email sent successfully.");
      } else {
        toast.error(result.error ?? "Test failed.");
      }
    });
  }

  const isBusy = savePending || testPending;

  return (
    <form id="mail-settings-form" action={saveAction}>
      {/* Hidden strategy field so the action always receives it */}
      <input type="hidden" name="mailStrategy" value={strategy} />

      <div className="space-y-6">
        {/* ── Header card ── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              Mail Delivery Configuration
            </CardTitle>
            <CardDescription>
              Configure how AVRA delivers emails. Secrets are encrypted at rest using AES-256-GCM
              and never exposed in plaintext after saving.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <Tabs
              value={strategy}
              onValueChange={(v) => setStrategy(v as typeof strategy)}
            >
              <TabsList className="mb-6 w-full justify-start">
                <TabsTrigger value="LOG" className="flex items-center gap-1.5">
                  <Terminal className="h-3.5 w-3.5" />
                  Log
                </TabsTrigger>
                <TabsTrigger value="SMTP" className="flex items-center gap-1.5">
                  <Server className="h-3.5 w-3.5" />
                  SMTP
                </TabsTrigger>
                <TabsTrigger value="RESEND" className="flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5" />
                  Resend
                </TabsTrigger>
              </TabsList>

              {/* ── General — shared across all strategies ── */}
              <div className="grid gap-4 sm:grid-cols-2 mb-6">
                <div className="space-y-2">
                  <Label htmlFor="mailFromName">Sender Name</Label>
                  <Input
                    id="mailFromName"
                    name="mailFromName"
                    placeholder="AVRA Compliance"
                    defaultValue={initial.mailFromName ?? ""}
                    disabled={isBusy}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mailFrom">Sender Email</Label>
                  <Input
                    id="mailFrom"
                    name="mailFrom"
                    type="email"
                    placeholder="noreply@yourdomain.com"
                    defaultValue={initial.mailFrom ?? ""}
                    disabled={isBusy}
                  />
                </div>
              </div>

              {/* ── LOG mode panel ── */}
              <TabsContent value="LOG">
                <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/40 p-6 text-center">
                  <Terminal className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
                  <p className="text-sm font-medium">Console Log Mode</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Emails are printed to the server console. No messages are actually delivered.
                    Switch to SMTP or Resend for real delivery.
                  </p>
                </div>
              </TabsContent>

              {/* ── SMTP panel ── */}
              <TabsContent value="SMTP">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="smtpHost">SMTP Host</Label>
                    <Input
                      id="smtpHost"
                      name="smtpHost"
                      placeholder="smtp.example.com"
                      defaultValue={initial.smtpHost ?? ""}
                      disabled={isBusy}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="smtpPort">Port</Label>
                    <Input
                      id="smtpPort"
                      name="smtpPort"
                      type="number"
                      placeholder="587"
                      defaultValue={initial.smtpPort ?? 587}
                      min={1}
                      max={65535}
                      disabled={isBusy}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="smtpUser">Username</Label>
                    <Input
                      id="smtpUser"
                      name="smtpUser"
                      placeholder="user@example.com"
                      autoComplete="username"
                      defaultValue={initial.smtpUser ?? ""}
                      disabled={isBusy}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="smtpPassword">
                      Password
                      {initial.hasSmtpPassword && (
                        <span className="ml-2 text-xs text-emerald-600 dark:text-emerald-400 font-normal">
                          ✓ saved
                        </span>
                      )}
                    </Label>
                    <PasswordInput
                      id="smtpPassword"
                      name="smtpPassword"
                      placeholder={
                        initial.hasSmtpPassword ? "Leave blank to keep current" : "Enter password"
                      }
                      disabled={isBusy}
                      autoComplete="new-password"
                    />
                  </div>
                </div>
                <div className="mt-3 flex items-start gap-2 rounded-md bg-blue-50 dark:bg-blue-950/30 p-3 text-xs text-blue-700 dark:text-blue-300">
                  <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>
                    Port 465 uses implicit TLS. Port 587 uses STARTTLS (recommended). Leave the
                    password blank to keep the currently stored secret.
                  </span>
                </div>
              </TabsContent>

              {/* ── Resend panel ── */}
              <TabsContent value="RESEND">
                <div className="space-y-2">
                  <Label htmlFor="resendApiKey">
                    Resend API Key
                    {initial.hasResendApiKey && (
                      <span className="ml-2 text-xs text-emerald-600 dark:text-emerald-400 font-normal">
                        ✓ saved
                      </span>
                    )}
                  </Label>
                  <PasswordInput
                    id="resendApiKey"
                    name="resendApiKey"
                    placeholder={
                      initial.hasResendApiKey ? "Leave blank to keep current" : "re_••••••••••••"
                    }
                    disabled={isBusy}
                  />
                </div>
                <div className="mt-3 flex items-start gap-2 rounded-md bg-blue-50 dark:bg-blue-950/30 p-3 text-xs text-blue-700 dark:text-blue-300">
                  <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>
                    The API key is encrypted with AES-256-GCM before being stored. It is never
                    returned or displayed after saving.
                  </span>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* ── Save row ── */}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={isBusy}>
            {savePending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Configuration
          </Button>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            Active strategy: <StrategyBadge strategy={strategy} />
          </div>
        </div>

        {/* ── Test connection card ── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Send className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              Send Test Email
            </CardTitle>
            <CardDescription>
              Verify your current configuration by sending a real test message. Uses any unsaved
              credentials you have entered above.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <Input
                type="email"
                placeholder="recipient@example.com"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                disabled={isBusy}
                className="max-w-sm"
                aria-label="Test recipient email address"
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleTest}
                disabled={isBusy || strategy === "LOG"}
              >
                {testPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Send Test
              </Button>
            </div>
            {strategy === "LOG" && (
              <p className="mt-2 text-xs text-muted-foreground">
                Test delivery is not available in Log mode. Switch to SMTP or Resend first.
              </p>
            )}
          </CardContent>
        </Card>

        {saveState && !saveState.ok && (
          <p className="text-sm text-destructive" role="alert">
            {saveState.error}
          </p>
        )}
      </div>
    </form>
  );
}
