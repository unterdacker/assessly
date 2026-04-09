"use client";

import { useActionState, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { saveOidcSettings } from "@/app/actions/oidc-settings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

interface OidcSettingsFormProps {
  locale: string;
  config: {
    isEnabled: boolean;
    issuerUrl: string;
    clientId: string;
    hasClientSecret: boolean;
    jitProvisioning: boolean;
    jitAllowedEmailDomains: string[];
  } | null;
}

const errorKeyMap: Record<string, string> = {
  FORBIDDEN: "errorForbidden",
  SSRF_BLOCKED: "errorSsrfBlocked",
  INVALID_ISSUER: "errorInvalidIssuer",
  CLIENT_ID_REQUIRED: "errorClientIdRequired",
  CLIENT_SECRET_REQUIRED: "errorClientSecretRequired",
};

export function OidcSettingsForm({ locale: _locale, config }: OidcSettingsFormProps) {
  const t = useTranslations("OidcSettings");
  const [state, formAction, isPending] = useActionState(saveOidcSettings, { ok: false });
  const [jitProvisioning, setJitProvisioning] = useState(config?.jitProvisioning ?? false);
  const [replaceSecret, setReplaceSecret] = useState(false);

  const showSecretInput = useMemo(() => {
    if (!config?.hasClientSecret) {
      return true;
    }
    return replaceSecret;
  }, [config?.hasClientSecret, replaceSecret]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-5">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-1">
              <Label htmlFor="isEnabled">{t("enabledLabel")}</Label>
            </div>
            <input
              id="isEnabled"
              name="isEnabled"
              type="checkbox"
              defaultChecked={config?.isEnabled ?? false}
              className="h-4 w-4"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="issuerUrl">{t("issuerUrlLabel")}</Label>
            <Input
              id="issuerUrl"
              name="issuerUrl"
              defaultValue={config?.issuerUrl ?? ""}
              placeholder={t("issuerUrlPlaceholder")}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="clientId">{t("clientIdLabel")}</Label>
            <Input id="clientId" name="clientId" defaultValue={config?.clientId ?? ""} required />
          </div>

          {config?.hasClientSecret ? (
            <div className="space-y-3">
              {config?.hasClientSecret && !replaceSecret ? (
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{t("clientSecretConfigured")}</Badge>
                </div>
              ) : null}
              <div className="flex items-center gap-2">
                <input
                  id="replaceSecret"
                  type="checkbox"
                  checked={replaceSecret}
                  onChange={(event) => setReplaceSecret(event.target.checked)}
                  aria-expanded={showSecretInput}
                  aria-controls="client-secret-container"
                  className="h-4 w-4"
                />
                <Label htmlFor="replaceSecret">{t("replaceSecret")}</Label>
              </div>
            </div>
          ) : null}

          {showSecretInput ? (
            <div id="client-secret-container" className="space-y-2">
              <Label htmlFor="clientSecret">{t("clientSecretLabel")}</Label>
              <Input
                id="clientSecret"
                name="clientSecret"
                type="password"
                autoComplete="new-password"
                required={!config?.hasClientSecret || replaceSecret}
              />
            </div>
          ) : null}

          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <input
                id="jitProvisioning"
                name="jitProvisioning"
                type="checkbox"
                defaultChecked={config?.jitProvisioning ?? false}
                onChange={(event) => setJitProvisioning(event.target.checked)}
                aria-expanded={jitProvisioning}
                aria-controls="jit-domains-container"
                className="mt-1 h-4 w-4"
              />
              <div>
                <Label htmlFor="jitProvisioning">{t("jitProvisioningLabel")}</Label>
                <p className="text-sm text-muted-foreground">{t("jitProvisioningDescription")}</p>
              </div>
            </div>
          </div>

          {jitProvisioning ? (
            <div id="jit-domains-container" className="space-y-2">
              <Label htmlFor="jitAllowedEmailDomains">{t("jitDomainsLabel")}</Label>
              <Input
                id="jitAllowedEmailDomains"
                name="jitAllowedEmailDomains"
                defaultValue={(config?.jitAllowedEmailDomains ?? []).join(", ")}
                placeholder={t("jitDomainsPlaceholder")}
              />
              <p className="text-xs text-muted-foreground">{t("jitDomainsHelp")}</p>
            </div>
          ) : null}

          <p role="note" className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-300">
            {t("emailVerifiedNote")}
          </p>

          {state.error ? (
            <p role="alert" aria-live="assertive" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {t(errorKeyMap[state.error] ?? "errorInvalidIssuer")}
            </p>
          ) : null}

          {state.ok ? (
            <p className="rounded-md border border-emerald-300/60 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
              {t("saveSuccess")}
            </p>
          ) : null}

          <Button type="submit" disabled={isPending} aria-disabled={isPending}>
            {t("saveButton")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
