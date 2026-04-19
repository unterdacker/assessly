// app/api/cron/compliance-scheduler/route.ts
export const runtime = "nodejs";

import crypto from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { appEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { AuditLogger } from "@/lib/structured-logger";
import { calculateNextDueDate } from "@/modules/continuous-monitoring/lib/next-due-calculator";

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
    const now = new Date();

    // Fetch due schedules (autoSend=true, isActive=true, nextDueAt <= now)
    const schedules = await prisma.recurrenceSchedule.findMany({
      where: {
        isActive: true,
        autoSend: true,
        nextDueAt: { lte: now },
      },
      take: BATCH_SIZE,
      include: {
        vendor: { 
          select: { 
            id: true, 
            name: true, 
            companyId: true,
          },
        },
        company: { 
          select: { 
            id: true, 
            plan: true,
          },
        },
      },
      orderBy: { nextDueAt: "asc" },
    });

    // Log batch cap if reached
    if (schedules.length === BATCH_SIZE) {
      AuditLogger.systemHealth("cron.compliance_scheduler.batch_capped", "success", {
        details: {
          batchSize: BATCH_SIZE,
          message: "Batch cap reached — more schedules may be pending",
        },
      });
    }

    for (const schedule of schedules) {
      // Skip FREE companies (autoSend requires PREMIUM)
      if (schedule.company.plan !== "PREMIUM") {
        continue;
      }

      // Idempotency check: verify we haven't already processed this cycle
      // If lastAssessmentId exists, check if it was created after the previous cycle's due date
      if (schedule.lastAssessmentId) {
        const lastAssessment = await prisma.assessment.findUnique({
          where: { id: schedule.lastAssessmentId },
          select: { createdAt: true },
        });

        if (lastAssessment) {
          // Calculate when the previous cycle started
          // If interval is MONTHLY and nextDueAt is Dec 1, previous cycle started ~Nov 1
          const cycleStartApprox = new Date(schedule.nextDueAt);
          switch (schedule.interval) {
            case "MONTHLY":
              cycleStartApprox.setMonth(cycleStartApprox.getMonth() - 1);
              break;
            case "QUARTERLY":
              cycleStartApprox.setMonth(cycleStartApprox.getMonth() - 3);
              break;
            case "SEMI_ANNUAL":
              cycleStartApprox.setMonth(cycleStartApprox.getMonth() - 6);
              break;
            case "ANNUAL":
              cycleStartApprox.setFullYear(cycleStartApprox.getFullYear() - 1);
              break;
          }

          // If last assessment was created after the cycle start, we already processed this cycle
          if (lastAssessment.createdAt >= cycleStartApprox) {
            // Update nextDueAt and skip
            const newNextDueAt = calculateNextDueDate(schedule.interval, schedule.nextDueAt);
            await prisma.recurrenceSchedule.update({
              where: { id: schedule.id },
              data: { 
                nextDueAt: newNextDueAt, 
                updatedAt: new Date(),
              },
            });

            AuditLogger.systemHealth("cron.compliance_scheduler.already_processed", "success", {
              details: {
                scheduleId: schedule.id,
                vendorId: schedule.vendorId,
                message: "Assessment already exists for this cycle",
              },
            });

            processed++;
            continue;
          }
        }
      }

      // Calculate new nextDueAt from current nextDueAt (not from now!)
      const newNextDueAt = calculateNextDueDate(schedule.interval, schedule.nextDueAt);

      // Update schedule with new nextDueAt
      await prisma.recurrenceSchedule.update({
        where: { id: schedule.id },
        data: { 
          nextDueAt: newNextDueAt, 
          updatedAt: new Date(),
        },
      });

      // Audit log
      AuditLogger.dataOp("recurrence.schedule_triggered", "success", {
        details: {
          scheduleId: schedule.id,
          vendorId: schedule.vendorId,
          companyId: schedule.company.id,
          interval: schedule.interval,
          previousDueAt: schedule.nextDueAt.toISOString(),
          nextDueAt: newNextDueAt.toISOString(),
        },
      });

      processed++;
    }

    // System health log
    AuditLogger.systemHealth("cron.compliance_scheduler.completed", "success", {
      details: {
        processed,
        schedulesFound: schedules.length,
      },
    });

    return NextResponse.json({ ok: true, processed });
  } catch (err) {
    AuditLogger.systemHealth("cron.compliance_scheduler.error", "failure", {
      details: { error: String(err) },
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
