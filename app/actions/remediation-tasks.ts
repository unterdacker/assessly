"use server";

import { revalidatePath } from "next/cache";
import { RemediationTaskStatus } from "@prisma/client";
import { z } from "zod";
import {
  requireAdminUser,
  requireInternalReadUser,
  requireInternalWriteUser,
} from "@/lib/auth/server";
import { logAuditEvent } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";

const CreateSchema = z.object({
  assessmentId: z.string().cuid(),
  questionId: z.string().min(1).max(100),
  title: z.string().min(1).max(255),
  description: z.string().max(2000).optional().nullable(),
  status: z.nativeEnum(RemediationTaskStatus).optional(),
  dueDate: z.coerce.date().optional().nullable(),
  assigneeUserId: z.string().cuid().optional().nullable(),
});

const UpdateSchema = z.object({
  id: z.string().cuid(),
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional().nullable(),
  status: z.nativeEnum(RemediationTaskStatus).optional(),
  dueDate: z.coerce.date().optional().nullable(),
  assigneeUserId: z.string().cuid().optional().nullable(),
});

const DeleteSchema = z.object({ id: z.string().cuid() });
const ListSchema = z.object({ assessmentId: z.string().cuid() });

export async function createRemediationTask(input: unknown) {
  const session = await requireInternalWriteUser();
  if (!session.companyId) return { success: false, error: "No company context." };
  const companyId = session.companyId;

  const parsed = CreateSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.flatten() };

  const { assessmentId, questionId, title, description, status, dueDate, assigneeUserId } = parsed.data;

  const assessment = await prisma.assessment.findFirst({
    where: { id: assessmentId, companyId },
    select: { id: true },
  });
  if (!assessment) return { success: false, error: "Assessment not found." };

  if (assigneeUserId) {
    const assignee = await prisma.user.findFirst({
      where: { id: assigneeUserId, companyId },
      select: { id: true },
    });
    if (!assignee) return { success: false, error: "Invalid assignee." };
  }

  const task = await prisma.remediationTask.create({
    data: {
      companyId,
      assessmentId,
      questionId,
      title,
      description: description ?? null,
      status: status ?? RemediationTaskStatus.OPEN,
      dueDate: dueDate ?? null,
      assigneeUserId: assigneeUserId ?? null,
      createdBy: session.userId,
    },
  });

  await logAuditEvent(
    {
      companyId,
      userId: session.userId,
      action: "REMEDIATION_TASK_CREATED",
      entityType: "RemediationTask",
      entityId: task.id,
      newValue: { title: task.title, assessmentId: task.assessmentId, status: task.status },
    },
    { captureHeaders: true },
  );

  revalidatePath("/", "layout");
  return { success: true, data: task };
}

export async function updateRemediationTask(input: unknown) {
  const session = await requireInternalWriteUser();
  if (!session.companyId) return { success: false, error: "No company context." };
  const companyId = session.companyId;

  const parsed = UpdateSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.flatten() };

  const { id, title, description, status, dueDate, assigneeUserId } = parsed.data;

  const existing = await prisma.remediationTask.findFirst({
    where: { id, companyId },
    select: { id: true },
  });
  if (!existing) return { success: false, error: "Task not found." };

  if (assigneeUserId) {
    const assignee = await prisma.user.findFirst({
      where: { id: assigneeUserId, companyId },
      select: { id: true },
    });
    if (!assignee) return { success: false, error: "Invalid assignee." };
  }

  const task = await prisma.remediationTask.update({
    where: { id },
    data: {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(dueDate !== undefined && { dueDate }),
      ...(assigneeUserId !== undefined && { assigneeUserId }),
      ...(status !== undefined && {
        status,
        resolvedAt: status === RemediationTaskStatus.RESOLVED ? new Date() : null,
      }),
    },
  });

  await logAuditEvent(
    {
      companyId,
      userId: session.userId,
      action: "REMEDIATION_TASK_UPDATED",
      entityType: "RemediationTask",
      entityId: task.id,
      newValue: { status: task.status, title: task.title },
    },
    { captureHeaders: true },
  );

  revalidatePath("/", "layout");
  return { success: true, data: task };
}

export async function deleteRemediationTask(input: unknown) {
  const session = await requireAdminUser();
  if (!session.companyId) return { success: false, error: "No company context." };
  const companyId = session.companyId;

  const parsed = DeleteSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.flatten() };
  const { id } = parsed.data;

  const task = await prisma.remediationTask.findFirst({
    where: { id, companyId },
    select: { id: true, title: true, assessmentId: true, status: true },
  });
  if (!task) return { success: false, error: "Task not found." };

  await prisma.remediationTask.delete({ where: { id } });

  await logAuditEvent(
    {
      companyId,
      userId: session.userId,
      action: "REMEDIATION_TASK_DELETED",
      entityType: "RemediationTask",
      entityId: id,
      previousValue: {
        title: task.title,
        assessmentId: task.assessmentId,
        status: task.status,
      },
    },
    { captureHeaders: true },
  );

  revalidatePath("/", "layout");
  return { success: true };
}

export async function listRemediationTasks(input: unknown) {
  const session = await requireInternalReadUser();
  if (!session.companyId) return { success: false, error: "No company context." };
  const companyId = session.companyId;

  const parsed = ListSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.flatten() };

  const { assessmentId } = parsed.data;

  const assessment = await prisma.assessment.findFirst({
    where: { id: assessmentId, companyId },
    select: { id: true },
  });
  if (!assessment) return { success: false, error: "Assessment not found." };

  const tasks = await prisma.remediationTask.findMany({
    where: { assessmentId, companyId },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
  });

  return { success: true, data: tasks };
}
