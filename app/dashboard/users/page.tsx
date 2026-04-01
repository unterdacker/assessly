import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getOptionalAuthSession } from "@/lib/auth/server";
import { UsersTable, type InternalUser } from "@/components/users-table";
import { AddUserModal } from "@/components/add-user-modal";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("UserManagement");
  return {
    title: t("pageTitle"),
    description: t("pageDesc"),
  };
}

type UsersPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function UsersPage({ params }: UsersPageProps) {
  const { locale } = await params;
  const session = await getOptionalAuthSession();

  if (!session) {
    redirect(`/${locale}/auth/sign-in`);
  }

  if (session.role !== "ADMIN") {
    redirect(`/${locale}/dashboard`);
  }

  const t = await getTranslations("UserManagement");

  const rawUsers = await prisma.user.findMany({
    where: {
      companyId: session.companyId ?? undefined,
      role: { in: ["ADMIN", "AUDITOR"] },
    },
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const users: InternalUser[] = rawUsers.map((u) => ({
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    role: u.role,
    createdAt: u.createdAt.toISOString(),
  }));

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("pageDesc")}</p>
        </div>
        <AddUserModal />
      </div>
      <UsersTable users={users} currentUserId={session.userId} />
    </main>
  );
}
