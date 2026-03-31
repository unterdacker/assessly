"use client";

import * as React from "react";
import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { KeyRound, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { updatePassword } from "@/app/actions/update-password";

function PasswordInput({
  id,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  placeholder?: string;
}) {
  const [visible, setVisible] = React.useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={visible ? "text" : "password"}
        autoComplete="off"
        required
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pr-10"
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={visible ? "Hide password" : "Show password"}
        onClick={() => setVisible((v) => !v)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
      >
        {visible ? (
          <EyeOff className="h-4 w-4" aria-hidden />
        ) : (
          <Eye className="h-4 w-4" aria-hidden />
        )}
      </button>
    </div>
  );
}

const ERROR_I18N_MAP: Record<string, string> = {
  CURRENT_PASSWORD_WRONG: "passwordErrorCurrentWrong",
  PASSWORD_TOO_SHORT: "passwordErrorTooShort",
  PASSWORD_NO_UPPERCASE: "passwordErrorNoUppercase",
  PASSWORD_NO_LOWERCASE: "passwordErrorNoLowercase",
  PASSWORD_NO_NUMBER: "passwordErrorNoNumber",
  PASSWORD_NO_SPECIAL: "passwordErrorNoSpecial",
  NO_PASSWORD_SET: "passwordErrorNoPasswordSet",
};

export function PasswordSettings() {
  const t = useTranslations("PasswordSettings");
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [isPending, startTransition] = useTransition();

  const mismatch = confirm.length > 0 && next !== confirm;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (next !== confirm) return;

    startTransition(async () => {
      try {
        await updatePassword(current, next);
        toast.success(t("passwordSuccess"));
        setCurrent("");
        setNext("");
        setConfirm("");
      } catch (err) {
        const code =
          err instanceof Error ? err.message : "UNKNOWN";
        const i18nKey = ERROR_I18N_MAP[code] ?? "passwordError";
        toast.error(t(i18nKey as Parameters<typeof t>[0]));
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-indigo-600 dark:text-indigo-400" aria-hidden />
          {t("sectionTitle")}
        </CardTitle>
        <CardDescription>{t("sectionDesc")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4 max-w-sm">
          <div className="space-y-1.5">
            <Label htmlFor="current-password">{t("currentPassword")}</Label>
            <PasswordInput
              id="current-password"
              value={current}
              onChange={setCurrent}
              disabled={isPending}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new-password">{t("newPassword")}</Label>
            <PasswordInput
              id="new-password"
              value={next}
              onChange={setNext}
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">{t("passwordHint")}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirm-password">{t("confirmPassword")}</Label>
            <PasswordInput
              id="confirm-password"
              value={confirm}
              onChange={setConfirm}
              disabled={isPending}
            />
            {mismatch && (
              <p className="text-xs text-red-600 dark:text-red-400">{t("passwordMismatch")}</p>
            )}
          </div>

          <Button
            type="submit"
            size="sm"
            disabled={
              isPending ||
              !current ||
              !next ||
              !confirm ||
              mismatch
            }
          >
            {isPending ? t("passwordSaving") : t("passwordSave")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
