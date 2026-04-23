"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { ShieldCheck, Copy, Check, TriangleAlert, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { generateMfaSecretForSetup, completeForcedMfaSetup } from "@/app/actions/mfa";
import type { MfaVerifyState } from "@/app/actions/mfa";

type Phase = "idle" | "scanning" | "codes";

const initialState: MfaVerifyState & { recoveryCodes?: string[] } = { error: null };
const SETUP_ERROR_MAP: Record<string, string> = {
  INVALID_MFA_TOKEN: "errorInvalidToken",
  SETUP_SESSION_EXPIRED: "errorExpiredSession",
  ALREADY_ENROLLED: "errorAlreadyEnrolled",
};

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={label}
      className="ml-1.5 inline-flex items-center text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden />
      )}
    </button>
  );
}

export function MfaSetupRequiredContent({ locale }: { locale: string }) {
  const t = useTranslations("MfaSetupRequired");
  const router = useRouter();
  
  const [phase, setPhase] = useState<Phase>("idle");
  const [enrollUri, setEnrollUri] = useState<string>("");
  const [enrollSecret, setEnrollSecret] = useState<string>("");
  
  const [state, formAction, isPending] = useActionState(
    async (prevState: MfaVerifyState | null, formData: FormData) => {
      const result = await completeForcedMfaSetup(prevState, formData);
      if (result && !result.error && 'recoveryCodes' in result) {
        setPhase("codes");
      }
      return result;
    },
    initialState
  );

  async function handleStartSetup() {
    try {
      const result = await generateMfaSecretForSetup();
      setEnrollUri(result.uri);
      setEnrollSecret(result.secret);
      setPhase("scanning");
    } catch (err) {
      const code = err instanceof Error ? err.message : "UNKNOWN";
      if (code === "SETUP_SESSION_EXPIRED") {
        toast.error(t("errorExpiredSession"));
      } else {
        toast.error(t("errorExpiredSession"));
      }
    }
  }

  function downloadRecoveryCodes(codes: string[]) {
    const text = codes.join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "recovery-codes.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function finishSetup() {
    router.push(`/${locale}/dashboard`);
  }

  return (
    <Card className="mx-auto w-full max-w-md border-border bg-card shadow-sm">
      <CardHeader className="space-y-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--primary)] text-white">
          <ShieldCheck className="h-5 w-5" aria-hidden />
        </div>
        <div>
          <CardTitle className="text-foreground">{t("title")}</CardTitle>
          <CardDescription>
            {phase === "codes" ? t("recoveryCodesDesc") : t("description")}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {phase === "idle" && (
          <div className="space-y-4">
            <Button onClick={handleStartSetup} className="w-full">
              {t("submitButton")}
            </Button>
          </div>
        )}

        {phase === "scanning" && (
          <div className="space-y-6">
             <div className="space-y-2">
              <p className="text-sm font-medium">{t("scanTitle")}</p>
              <div className="inline-block rounded-[calc(var(--radius-card)+4px)] bg-transparent dark:bg-slate-800 dark:p-1.5">
                <div className="inline-block rounded-xl border border-slate-200 dark:border-slate-700 bg-white p-3">
                  <QRCodeSVG
                    value={enrollUri}
                    size={192}
                    level="M"
                    aria-label={t("qrAlt")}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {t("manualKeyLabel")}
              </p>
              <div className="flex items-center gap-1 rounded-md border bg-muted/40 px-3 py-2">
                <code className="text-xs font-mono tracking-widest break-all">
                  {enrollSecret}
                </code>
                <CopyButton value={enrollSecret} label={t("copyButtonLabel")} />
              </div>
            </div>

            <form action={formAction} className="space-y-4">
              <input type="hidden" name="locale" value={locale} />
              <div className="space-y-1.5">
                <Label htmlFor="setup-token">{t("verifyLabel")}</Label>
                <Input
                  id="setup-token"
                  name="token"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  placeholder="000000"
                  required
                  disabled={isPending}
                  className="text-center font-mono text-lg tracking-[0.4em]"
                />
              </div>

              {state?.error && (
                <div role="alert" aria-live="polite" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {t((SETUP_ERROR_MAP[state.error] ?? state.error) as Parameters<typeof t>[0])}
                </div>
              )}

              <Button type="submit" disabled={isPending} className="w-full">
                {isPending ? t("submitting") : t("submitButton")}
              </Button>
            </form>
          </div>
        )}

        {phase === "codes" && state && "recoveryCodes" in state && state.recoveryCodes && (
          <div className="space-y-6">
            <h2 className="text-sm font-semibold">{t("recoveryCodesTitle")}</h2>
            <div
              role="alert"
              className="flex items-start gap-3 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-amber-900 dark:text-amber-200"
            >
              <TriangleAlert className="min-h-5 min-w-5 shrink-0" aria-hidden />
              <p className="text-sm">{t("recoveryCodesDesc")}</p>
            </div>

            <div className="grid grid-cols-2 gap-2 rounded-md bg-muted p-4">
              {state.recoveryCodes.map((c) => (
                <code key={c} className="text-xs font-mono select-all">
                  {c}
                </code>
              ))}
            </div>

            <div className="space-y-3">
              <Button
                type="button"
                variant="outline"
                className="w-full gap-2"
                onClick={() => downloadRecoveryCodes(state.recoveryCodes!)}
              >
                <Download className="h-4 w-4" aria-hidden />
                {t("downloadButton")}
              </Button>
              <Button type="button" onClick={finishSetup} className="w-full">
                {t("continueButton")}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}