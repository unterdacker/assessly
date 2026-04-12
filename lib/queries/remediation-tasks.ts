import "server-only";

import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function listRemediationTasksByAssessmentId(
  assessmentId: string,
  companyId: string,
) {
  return prisma.remediationTask.findMany({
    where: { assessmentId, companyId },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
  });
}

export async function countOpenRemediationTasks(companyId: string): Promise<number> {
  return prisma.remediationTask.count({
    where: {
      companyId,
      status: { in: ["OPEN", "IN_PROGRESS"] },
    },
  });
}

export async function listInternalUsersForCompany(
  companyId: string,
): Promise<{ id: string; displayName: string | null; email: string | null }[]> {
  const internalWriteRoles: UserRole[] = ["SUPER_ADMIN", "ADMIN", "RISK_REVIEWER"];

  return prisma.user.findMany({
    where: {
      companyId,
      isActive: true,
      role: { in: internalWriteRoles },
    },
    select: { id: true, displayName: true, email: true },
    orderBy: [{ displayName: "asc" }, { email: "asc" }],
  });
}
