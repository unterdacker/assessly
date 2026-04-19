// app/api/cron/sla-reminders/route.ts
export const runtime = "nodejs";

import crypto from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { appEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mail";
import { AuditLogger } from "@/lib/structured-logger";
import { isPremiumPlan } from "@/lib/plan-gate";
import { listPendingReminders } from "@/modules/sla-tracking/lib/sla-queries";
import {
  buildPreReminderHtml,
  buildPreReminderSubject,
  buildOverdueReminderHtml,
  buildOverdueReminderSubject,
  buildEscalationHtml,
  buildEscalationSubject,
} from "@/modules/sla-tracking/lib/email-templates";

const BATCH_SIZE = 50;

function verifyCronSecret(authHeader: string | null): boolean {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return false;
  const token = authHeader.slice(7);
  
  if (!appEnv.cronSecret) return false;
  
  const expected = Buffer.from(appEnv.cronSecret, "utf8");
  const received = Buffer.from(token, "utf8");
  if (expected.byteLength !== received.byteLength) return false;
  return crypto.timingSafeEqual(expected, received);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Auth check
  if (!verifyCronSecret(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let processed = 0;

  try {
    const pending = await listPendingReminders(BATCH_SIZE);

    if (pending.length === BATCH_SIZE) {
      AuditLogger.systemHealth("cron.sla_reminders.batch_capped", "success", {
        details: {
          batchSize: BATCH_SIZE,
          message: "Batch cap reached — more reminders may be pending",
        },
      });
    }

    for (const reminder of pending) {
      const { assessment } = reminder;
      const companyId = assessment.vendor.company.id;

      // Check premium plan
      const isPremium = await isPremiumPlan(companyId);

      if (!isPremium) {
        // FREE plan: mark sentAt without sending email
        await prisma.assessmentReminder.update({
          where: { id: reminder.id },
          data: { sentAt: new Date() },
        });
        processed++;
        continue;
      }

      // Determine if this triggers slaBreached
      if (reminder.type === "OVERDUE") {
        // Mark slaBreached BEFORE email attempt
        await prisma.assessment.update({
          where: { id: reminder.assessmentId },
          data: { slaBreached: true },
        });
        AuditLogger.dataOp("sla_breach.detected", "success", {
          details: { assessmentId: reminder.assessmentId, companyId },
        });
      }

      // Escalation: fail-closed
      if (reminder.type === "ESCALATION") {
        const recipientUserId = assessment.slaPolicy?.escalationRecipientUserId;
        if (!recipientUserId) {
          // No recipient — skip, log, mark as sent
          AuditLogger.systemHealth("cron.sla_reminders.escalation_skipped", "failure", {
            details: {
              reminderId: reminder.id,
              reason: "No escalation recipient configured",
            },
          });
          await prisma.assessmentReminder.update({
            where: { id: reminder.id },
            data: { sentAt: new Date() },
          });
          processed++;
          continue;
        }

        // Find escalation recipient user
        const recipientUser = await prisma.user.findFirst({
          where: { id: recipientUserId, companyId: companyId ?? undefined },
          select: { email: true, displayName: true },
        });

        if (!recipientUser?.email) {
          AuditLogger.systemHealth("cron.sla_reminders.escalation_skipped", "failure", {
            details: {
              reminderId: reminder.id,
              reason: "Escalation recipient has no email",
            },
          });
          await prisma.assessmentReminder.update({
            where: { id: reminder.id },
            data: { sentAt: new Date() },
          });
          processed++;
          continue;
        }

        const daysOverdue = assessment.dueDate
          ? Math.floor((Date.now() - new Date(assessment.dueDate).getTime()) / 86400000)
          : 0;

        // Send escalation email
        void sendMail({
          to: recipientUser.email,
          subject: buildEscalationSubject({
            vendorName: assessment.vendor?.name ?? "Vendor",
            companyName: assessment.vendor?.company?.name ?? "Company",
            assessmentUrl: `${appEnv.url}/external/portal`,
            daysOverdue,
            policyName: assessment.slaPolicy?.name ?? "SLA Policy",
            escalationRecipientName: recipientUser.displayName ?? recipientUser.email,
          }),
          html: buildEscalationHtml({
            vendorName: assessment.vendor?.name ?? "Vendor",
            companyName: assessment.vendor?.company?.name ?? "Company",
            assessmentUrl: `${appEnv.url}/external/portal`,
            daysOverdue,
            policyName: assessment.slaPolicy?.name ?? "SLA Policy",
            escalationRecipientName: recipientUser.displayName ?? recipientUser.email,
          }),
        }).catch((err) => {
          AuditLogger.systemHealth("cron.sla_reminders.email_failed", "failure", {
            details: { reminderId: reminder.id, error: String(err) },
          });
        });

        await prisma.assessmentReminder.update({
          where: { id: reminder.id },
          data: { sentAt: new Date() },
        });
        processed++;
        continue;
      }

      // PRE_DUE and OVERDUE reminders: send to vendor (recipientEmail field)
      const daysUntilDue = assessment.dueDate
        ? Math.ceil((new Date(assessment.dueDate).getTime() - Date.now()) / 86400000)
        : 0;
      const daysOverdue = assessment.dueDate
        ? Math.floor((Date.now() - new Date(assessment.dueDate).getTime()) / 86400000)
        : 0;

      const html =
        reminder.type === "PRE_DUE"
          ? buildPreReminderHtml({
              vendorName: assessment.vendor?.name ?? "Vendor",
              companyName: assessment.vendor?.company?.name ?? "Company",
              assessmentUrl: `${appEnv.url}/external/portal`,
              daysUntilDue,
              policyName: assessment.slaPolicy?.name ?? "SLA Policy",
            })
          : buildOverdueReminderHtml({
              vendorName: assessment.vendor?.name ?? "Vendor",
              companyName: assessment.vendor?.company?.name ?? "Company",
              assessmentUrl: `${appEnv.url}/external/portal`,
              daysOverdue,
              policyName: assessment.slaPolicy?.name ?? "SLA Policy",
            });

      const subject =
        reminder.type === "PRE_DUE"
          ? buildPreReminderSubject({
              vendorName: assessment.vendor?.name ?? "Vendor",
              companyName: assessment.vendor?.company?.name ?? "Company",
              assessmentUrl: `${appEnv.url}/external/portal`,
              daysUntilDue,
              policyName: assessment.slaPolicy?.name ?? "SLA Policy",
            })
          : buildOverdueReminderSubject({
              vendorName: assessment.vendor?.name ?? "Vendor",
              companyName: assessment.vendor?.company?.name ?? "Company",
              assessmentUrl: `${appEnv.url}/external/portal`,
              daysOverdue,
              policyName: assessment.slaPolicy?.name ?? "SLA Policy",
            });

      void sendMail({
        to: reminder.recipientEmail,
        subject,
        html,
      }).catch((err) => {
        AuditLogger.systemHealth("cron.sla_reminders.email_failed", "failure", {
          details: { reminderId: reminder.id, error: String(err) },
        });
      });

      await prisma.assessmentReminder.update({
        where: { id: reminder.id },
        data: { sentAt: new Date() },
      });
      processed++;
    }

    // GDPR retention: purge AssessmentReminder rows older than 90 days
    void prisma.assessmentReminder
      .deleteMany({
        where: { createdAt: { lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } },
      })
      .catch(() => undefined);

    return NextResponse.json({ ok: true, processed });
  } catch (err) {
    AuditLogger.systemHealth("cron.sla_reminders.error", "failure", {
      details: { error: String(err) },
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
