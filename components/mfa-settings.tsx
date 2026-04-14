"use client";

import * as React from "react";
import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { ShieldCheck, ShieldOff, KeyRound, Copy, Check, TriangleAlert, Download } from "lucide-react";
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
  regenerateRecoveryCodes,
} from "@/app/actions/mfa";

type Phase =
  | "idle"
  | "enrolling-setup"
  | "disabling";

type MfaSettingsProps = {
  mfaEnabled: boolean;
  hasRecoveryCodes: boolean;
};

const ENROLL_ERROR_MAP: Record<string, string> = {
  INVALID_MFA_TOKEN: "errorInvalidToken",
  NO_MFA_SECRET: "errorNoSecret",
};

const DISABLE_ERROR_MAP: Record<string, string> = {
  INVALID_MFA_TOKEN: "errorInvalidToken",
  MFA_NOT_ENABLED: "errorNotEnabled",
};

function CopyButton({ value, label }: { value: string; label: string }) {
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
      aria-label={label}
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

export function MfaSettings({ mfaEnabled, hasRecoveryCodes }: MfaSettingsProps) {
  const t = useTranslations("MfaSettings");

  const [phase, setPhase] = React.useState<Phase>("idle");
  const [enrollUri, setEnrollUri] = React.useState<string>("");
  const [enrollSecret, setEnrollSecret] = React.useState<string>("");
  const [enrollToken, setEnrollToken] = React.useState("");
  const [disableToken, setDisableToken] = React.useState("");
  const [regenToken, setRegenToken] = React.useState("");
  const [isEnabled, setIsEnabled] = React.useState(mfaEnabled);
  const [codesExists, setCodesExists] = React.useState(hasRecoveryCodes);
  const [justGeneratedCodes, setJustGeneratedCodes] = React.useState<string[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const [showRegen, setShowRegen] = React.useState(false);

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
        const result = await verifyAndEnableMfa(enrollToken);
        setIsEnabled(true);
        setPhase("idle");
        setEnrollUri("");
        setEnrollSecret("");
        setEnrollToken("");
        if (result && result.success && result.recoveryCodes) {
          setJustGeneratedCodes(result.recoveryCodes);
          setCodesExists(true);
        }
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
        setCodesExists(false);
        setJustGeneratedCodes(null);
        toast.success(t("disabledSuccess"));
      } catch (err) {
        const code = err instanceof Error ? err.message : "UNKNOWN";
        const key = DISABLE_ERROR_MAP[code] ?? "errorGeneric";
        toast.error(t(key as Parameters<typeof t>[0]));
      }
    });
  }

  function handleRegenerateCodes() {
    startTransition(async () => {
      try {
        const result = await regenerateRecoveryCodes(regenToken);
        if (result && result.success && result.recoveryCodes) {
          setJustGeneratedCodes(result.recoveryCodes);
          setCodesExists(true);
          setShowRegen(false);
          setRegenToken("");
          toast.success(t("recoveryCodes.regenerateSuccess"));
        }
      } catch {
        toast.error(t("recoveryCodes.errorRegenerate"));
      }
    });
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
                <CopyButton value={enrollSecret} label={t("copyButtonLabel")} />
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

        {/* Recovery Codes section */}
        {phase === "idle" && isEnabled && (
          <div className="pt-6 mt-6 border-t border-border">
            <h3 className="text-sm font-medium mb-1">{t("recoveryCodes.sectionTitle")}</h3>
            <p className="mb-3 text-xs text-muted-foreground">{t("recoveryCodes.sectionDesc")}</p>
            
            {justGeneratedCodes !== null ? (
              <div className="space-y-4">
                <div
                  role="alert"
                  className="flex items-start gap-3 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-amber-900 dark:text-amber-200"
                >
                  <TriangleAlert className="min-h-5 min-w-5 shrink-0" aria-hidden />
                  <p className="text-sm">{t("recoveryCodes.warningOnce")}</p>
                </div>
                
                <div className="grid grid-cols-2 gap-2 rounded-md bg-muted p-4">
                  {justGeneratedCodes.map((code) => (
                    <code key={code} className="text-xs font-mono select-all">
                      {code}
                    </code>
                  ))}
                </div>
                
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2"
                    onClick={() => downloadRecoveryCodes(justGeneratedCodes)}
                  >
                    <Download className="h-4 w-4" aria-hidden />
                    {t("recoveryCodes.downloadButton")}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => setJustGeneratedCodes(null)}
                  >
                    {t("cancel")}
                  </Button>
                </div>
              </div>
            ) : codesExists ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {t("recoveryCodes.codesExistHint")}
                </p>
                {!showRegen ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowRegen(true)}
                  >
                    {t("recoveryCodes.regenerateButton")}
                  </Button>
                ) : (
                  <div className="space-y-3 max-w-xs p-4 border rounded-md bg-slate-50/50 dark:bg-slate-900/30">
                    <p className="text-sm font-medium">{t("recoveryCodes.regenerateTitle")}</p>
                    <p className="text-xs text-muted-foreground mb-2">
                      {t("recoveryCodes.regenerateDesc")}
                    </p>
                    <div className="space-y-1.5">
                      <Label htmlFor="regen-token">{t("verifyLabel")}</Label>
                      <Input
                        id="regen-token"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]{6}"
                        maxLength={6}
                        placeholder="000000"
                        required
                        disabled={isPending}
                        value={regenToken}
                        onChange={(e) => setRegenToken(e.target.value.replace(/\D/g, ""))}
                        className="text-center font-mono text-lg tracking-[0.4em]"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={isPending || regenToken.length !== 6}
                        onClick={handleRegenerateCodes}
                      >
                        {isPending ? t("recoveryCodes.regenerating") : t("recoveryCodes.regenerateButton")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isPending}
                        onClick={() => {
                          setShowRegen(false);
                          setRegenToken("");
                        }}
                      >
                        {t("cancel")}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
