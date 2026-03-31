"use client";

import * as React from "react";
import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { MoreHorizontal, ShieldOff } from "lucide-react";
import type { UserRole } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { updateUserRole, deleteUser } from "@/app/actions/iam";

export type InternalUser = {
  id: string;
  email: string | null;
  displayName: string | null;
  role: UserRole;
  createdAt: string; // ISO string – serialised from the server component
};

type UsersTableProps = {
  users: InternalUser[];
  /** The ID of the currently logged-in admin – used to disable self-mutation. */
  currentUserId: string;
};

function RoleBadge({ role }: { role: UserRole }) {
  const t = useTranslations("UserManagement");
  if (role === "ADMIN") {
    return <Badge variant="high">{t("roleAdmin")}</Badge>;
  }
  return <Badge variant="default">{t("roleAuditor")}</Badge>;
}

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function ActionsCell({
  user,
  isSelf,
}: {
  user: InternalUser;
  isSelf: boolean;
}) {
  const t = useTranslations("UserManagement");
  const [isPending, startTransition] = useTransition();
  const [revokeOpen, setRevokeOpen] = React.useState(false);

  function handleRoleChange(newRole: UserRole) {
    startTransition(async () => {
      try {
        await updateUserRole(user.id, newRole);
        toast.success(t("roleChangedSuccess"));
      } catch {
        toast.error(t("roleChangedError"));
      }
    });
  }

  function handleRevokeConfirm() {
    startTransition(async () => {
      try {
        await deleteUser(user.id);
        toast.success(t("revokeSuccess"));
      } catch {
        toast.error(t("revokeError"));
      }
    });
  }

  return (
    <>
      <AlertDialog open={revokeOpen} onOpenChange={setRevokeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("revokeConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("revokeConfirmDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>
              {t("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              onClick={(e) => {
                e.preventDefault();
                handleRevokeConfirm();
                setRevokeOpen(false);
              }}
            >
              <ShieldOff className="h-4 w-4" aria-hidden />
              {t("revokeConfirmAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="secondary"
            size="sm"
            className="h-7 w-7 p-0"
            disabled={isSelf || isPending}
            aria-label={isSelf ? t("selfChangeDisabled") : t("changeRole")}
            title={isSelf ? t("selfChangeDisabled") : undefined}
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{t("changeRole")}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={user.role === "ADMIN" || isPending}
            onSelect={() => handleRoleChange("ADMIN")}
          >
            {t("changeRoleToAdmin")}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={user.role === "AUDITOR" || isPending}
            onSelect={() => handleRoleChange("AUDITOR")}
          >
            {t("changeRoleToAuditor")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={isPending}
            className="text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400"
            onSelect={() => setRevokeOpen(true)}
          >
            <ShieldOff className="h-4 w-4" aria-hidden />
            {t("revokeAccess")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

export function UsersTable({ users, currentUserId }: UsersTableProps) {
  const t = useTranslations("UserManagement");

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("colEmail")}</TableHead>
          <TableHead>{t("colDisplayName")}</TableHead>
          <TableHead>{t("colRole")}</TableHead>
          <TableHead>{t("colCreatedAt")}</TableHead>
          <TableHead className="w-14 text-right">{t("colActions")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.length === 0 ? (
          <TableRow>
            <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
              {t("noUsers")}
            </TableCell>
          </TableRow>
        ) : (
          users.map((user) => (
            <TableRow key={user.id}>
              <TableCell className="font-medium">{user.email ?? "—"}</TableCell>
              <TableCell className="text-muted-foreground">{user.displayName ?? "—"}</TableCell>
              <TableCell>
                <RoleBadge role={user.role} />
              </TableCell>
              <TableCell className="text-muted-foreground">{formatDate(user.createdAt)}</TableCell>
              <TableCell className="text-right">
                <ActionsCell user={user} isSelf={user.id === currentUserId} />
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

