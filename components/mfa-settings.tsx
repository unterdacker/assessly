"use client";

import * as React from "react";
import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { ShieldCheck, ShieldOff, KeyRound, Copy, Check } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import {
  generateMfaSecret,
  verifyAndEnableMfa,
  disableMfa,
} from "@/app/actions/mfa";

type Phase =
  | "idle"
  | "enrolling-setup"   // QR code displayed, waiting for first token
  | "disabling";        // Confirm disable with TOTP

const ENROLL_ERROR_MAP: Record<string, string> = {
  INVALID_MFA_TOKEN: "errorInvalidToken",
  NO_MFA_SECRET: "errorNoSecret",
};

const DISABLE_ERROR_MAP: Record<string, string> = {
  INVALID_MFA_TOKEN: "errorInvalidToken",
  MFA_NOT_ENABLED: "errorNotEnabled",
};

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = React.useState(false);
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
      aria-label="Copy secret key"
      className="ml-1.5 inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden />
      )}
    </button>
  );
}

export function MfaSettings({ mfaEnabled }: { mfaEnabled: boolean }) {
  const t = useTranslations("MfaSettings");
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [enrollUri, setEnrollUri] = React.useState<string>("");
  const [enrollSecret, setEnrollSecret] = React.useState<string>("");
  const [enrollToken, setEnrollToken] = React.useState("");
  const [disableToken, setDisableToken] = React.useState("");
  const [isEnabled, setIsEnabled] = React.useState(mfaEnabled);
  const [isPending, startTransition] = useTransition();

  function startEnrollment() {
    startTransition(async () => {
      try {
        const result = await generateMfaSecret();
        setEnrollUri(result.uri);
        setEnrollSecret(result.secret);
        setEnrollToken("");
        setPhase("enrolling-setup");
      } catch {
        toast.error(t("errorGenerate"));
      }
    });
  }

  function confirmEnrollment() {
    startTransition(async () => {
      try {
        await verifyAndEnableMfa(enrollToken);
        setIsEnabled(true);
        setPhase("idle");
        setEnrollUri("");
        setEnrollSecret("");
        setEnrollToken("");
        toast.success(t("enabledSuccess"));
      } catch (err) {
        const code = err instanceof Error ? err.message : "UNKNOWN";
        const key = ENROLL_ERROR_MAP[code] ?? "errorGeneric";
        toast.error(t(key as Parameters<typeof t>[0]));
      }
    });
  }

  function confirmDisable() {
    startTransition(async () => {
      try {
        await disableMfa(disableToken);
        setIsEnabled(false);
        setPhase("idle");
        setDisableToken("");
        toast.success(t("disabledSuccess"));
      } catch (err) {
        const code = err instanceof Error ? err.message : "UNKNOWN";
        const key = DISABLE_ERROR_MAP[code] ?? "errorGeneric";
        toast.error(t(key as Parameters<typeof t>[0]));
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck
            className="h-5 w-5 text-indigo-600 dark:text-indigo-400"
            aria-hidden
          />
          {t("sectionTitle")}
        </CardTitle>
        <CardDescription>{t("sectionDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Status row */}
        <div className="flex items-center justify-between rounded-lg border p-4 bg-slate-50/50 dark:bg-slate-900/30">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">{t("statusLabel")}</p>
            <p className="text-xs text-muted-foreground">{t("statusHint")}</p>
          </div>
          {isEnabled ? (
            <Badge
              variant="outline"
              className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800"
            >
              {t("statusEnabled")}
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800"
            >
              {t("statusDisabled")}
            </Badge>
          )}
        </div>

        {/* Idle state */}
        {phase === "idle" && !isEnabled && (
          <Button
            onClick={startEnrollment}
            disabled={isPending}
            size="sm"
            className="gap-2"
          >
            <KeyRound className="h-4 w-4" aria-hidden />
            {isPending ? t("setupLoading") : t("setupButton")}
          </Button>
        )}

        {phase === "idle" && isEnabled && (
          <Button
            variant="destructive"
            size="sm"
            className="gap-2"
            onClick={() => setPhase("disabling")}
            disabled={isPending}
          >
            <ShieldOff className="h-4 w-4" aria-hidden />
            {t("disableButton")}
          </Button>
        )}

        {/* Enrollment: QR code + verification */}
        {phase === "enrolling-setup" && enrollUri && (
          <div className="space-y-5">
            <div className="space-y-2">
              <p className="text-sm font-medium">{t("scanTitle")}</p>
              <p className="text-xs text-muted-foreground">{t("scanHint")}</p>
              <div className="inline-block rounded-xl border border-slate-200 dark:border-slate-700 bg-white p-3">
                <QRCodeSVG
                  value={enrollUri}
                  size={192}
                  level="M"
                  aria-label={t("qrAlt")}
                />
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
                <CopyButton value={enrollSecret} />
              </div>
              <p className="text-xs text-muted-foreground">{t("manualKeyHint")}</p>
            </div>

            <div className="space-y-1.5 max-w-xs">
              <Label htmlFor="enroll-token">{t("verifyLabel")}</Label>
              <Input
                id="enroll-token"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="000000"
                required
                disabled={isPending}
                value={enrollToken}
                onChange={(e) => setEnrollToken(e.target.value.replace(/\D/g, ""))}
                className="text-center font-mono text-lg tracking-[0.4em]"
              />
            </div>

            <div className="flex gap-3">
              <Button
                size="sm"
                disabled={isPending || enrollToken.length !== 6}
                onClick={confirmEnrollment}
              >
                {isPending ? t("verifyLoading") : t("verifyButton")}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={isPending}
                onClick={() => {
                  setPhase("idle");
                  setEnrollToken("");
                  setEnrollUri("");
                  setEnrollSecret("");
                }}
              >
                {t("cancel")}
              </Button>
            </div>
          </div>
        )}

        {/* Disable MFA: confirm with TOTP */}
        {phase === "disabling" && (
          <div className="space-y-4 max-w-xs">
            <p className="text-sm text-muted-foreground">{t("disableConfirmHint")}</p>
            <div className="space-y-1.5">
              <Label htmlFor="disable-token">{t("verifyLabel")}</Label>
              <Input
                id="disable-token"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="000000"
                required
                disabled={isPending}
                value={disableToken}
                onChange={(e) => setDisableToken(e.target.value.replace(/\D/g, ""))}
                className="text-center font-mono text-lg tracking-[0.4em]"
              />
            </div>
            <div className="flex gap-3">
              <Button
                variant="destructive"
                size="sm"
                disabled={isPending || disableToken.length !== 6}
                onClick={confirmDisable}
              >
                {isPending ? t("verifyLoading") : t("disableConfirmButton")}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={isPending}
                onClick={() => {
                  setPhase("idle");
                  setDisableToken("");
                }}
              >
                {t("cancel")}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
