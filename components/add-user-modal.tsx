"use client";

import * as React from "react";
import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import type { UserRole } from "@prisma/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createInternalUser } from "@/app/actions/iam";

export function AddUserModal() {
  const t = useTranslations("UserManagement");
  const [open, setOpen] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<Extract<UserRole, "ADMIN" | "AUDITOR">>("AUDITOR");
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    if (!isPending) {
      setOpen(next);
      if (!next) {
        setEmail("");
        setRole("AUDITOR");
      }
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmedEmail = email.trim();
    if (!trimmedEmail) return;

    startTransition(async () => {
      try {
        const result = await createInternalUser(trimmedEmail, role);
        toast.success(t("addUserSuccess"), {
          description: t("addUserTempPassword", {
            password: result.temporaryPassword,
          }),
          duration: 12000,
        });
        setOpen(false);
        setEmail("");
        setRole("AUDITOR");
      } catch (err) {
        if (err instanceof Error && err.message === "EMAIL_ALREADY_EXISTS") {
          toast.error(t("addUserErrorEmailExists"));
        } else {
          toast.error(t("addUserError"));
        }
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <UserPlus className="h-4 w-4" aria-hidden />
          {t("addUser")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("addUserTitle")}</DialogTitle>
          <DialogDescription>{t("addUserDesc")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="new-user-email">{t("addUserEmail")}</Label>
            <Input
              id="new-user-email"
              type="email"
              autoComplete="off"
              required
              disabled={isPending}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-user-role">{t("addUserRole")}</Label>
            <Select
              value={role}
              onValueChange={(v) =>
                setRole(v as Extract<UserRole, "ADMIN" | "AUDITOR">)
              }
              disabled={isPending}
            >
              <SelectTrigger id="new-user-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AUDITOR">{t("roleAuditor")}</SelectItem>
                <SelectItem value="ADMIN">{t("roleAdmin")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="secondary"
              disabled={isPending}
              onClick={() => handleOpenChange(false)}
            >
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={isPending || !email.trim()}>
              {isPending ? t("addUserCreating") : t("addUserConfirm")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
