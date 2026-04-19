// app/api/cron/compliance-snapshot/route.ts
export const runtime = "nodejs";

import crypto from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { appEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mail";
import { AuditCategory, AuditLogger, LogLevel } from "@/lib/structured-logger";
import { detectRegression, calculateOverallScore } from "@/modules/continuous-monitoring/lib/regression-detection";
import { regressionAlertEmail } from "@/modules/continuous-monitoring/lib/email-templates";

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
    // Get all companies with active recurrence schedules
    const companies = await prisma.company.findMany({
      where: {
        recurrenceSchedules: { some: { isActive: true } },
      },
      select: { 
        id: true, 
        plan: true,
        name: true,
      },
    });

    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    for (const company of companies) {
      // Idempotency: skip if snapshot already exists today
      const existingSnapshot = await prisma.complianceSnapshot.findFirst({
        where: {
          companyId: company.id,
          snapshotDate: { gte: todayStart },
        },
      });

      if (existingSnapshot) {
        continue;
      }

      // Query all completed assessments for this company
      // Group by vendor to get the latest assessment per vendor
      const assessments = await prisma.assessment.findMany({
        where: {
          companyId: company.id,
          status: { in: ["COMPLETED", "ARCHIVED"] },
        },
        select: {
          id: true,
          vendorId: true,
          complianceScore: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      // Skip if no assessments
      if (assessments.length === 0) {
        continue;
      }

      // Get the latest assessment per vendor (already sorted by createdAt desc)
      const vendorAssessments = new Map<string, typeof assessments[0]>();
      for (const assessment of assessments) {
        if (!vendorAssessments.has(assessment.vendorId)) {
          vendorAssessments.set(assessment.vendorId, assessment);
        }
      }

      const latestAssessments = Array.from(vendorAssessments.values());

      // Calculate overall score (average compliance score)
      const totalScore = latestAssessments.reduce(
        (sum, assessment) => sum + assessment.complianceScore,
        0,
      );
      const overallScore = latestAssessments.length > 0
        ? Math.round((totalScore / latestAssessments.length) * 100) / 100
        : 0;

      // For categoryScores, we need to aggregate by category
      // Since Assessment model doesn't have categoryScores field, we'll use a simple
      // placeholder structure. In a real implementation, this would aggregate
      // AssessmentAnswer scores by category.
      // For now, we'll store the overall score as a single "overall" category
      const categoryScores: Record<string, number> = {
        overall: overallScore,
      };

      // Create snapshot
      await prisma.complianceSnapshot.create({
        data: {
          companyId: company.id,
          snapshotDate: todayStart,
          overallScore,
          categoryScores,
          frameworkKey: null, // Optional: could determine from most common template
          vendorCount: latestAssessments.length,
        },
      });

      // Premium feature: regression detection
      if (company.plan === "PREMIUM") {
        // Fetch previous snapshot
        const previousSnapshot = await prisma.complianceSnapshot.findFirst({
          where: {
            companyId: company.id,
            snapshotDate: { lt: todayStart },
          },
          orderBy: {
            snapshotDate: "desc",
          },
        });

        if (previousSnapshot) {
          const previousCategoryScores = previousSnapshot.categoryScores as Record<string, number>;
          
          // Default threshold: 10 percentage points
          // In a real implementation, this would be configurable per company
          const threshold = 10;

          const regressedCategories = detectRegression(
            previousCategoryScores,
            categoryScores,
            threshold,
          );

          if (regressedCategories.length > 0) {
            const previousOverallScore = Number(previousSnapshot.overallScore);

            // Log regression in audit trail (stdout for log aggregation)
            AuditLogger.log({
              category: AuditCategory.DATA_OPERATIONS,
              action: "compliance.regression_detected",
              status: "success",
              level: LogLevel.WARN,
              details: {
                companyId: company.id,
                categories: regressedCategories,
                previousScore: previousOverallScore,
                currentScore: overallScore,
                threshold,
                snapshotDate: todayStart.toISOString(),
              },
            });

            // Write regression alert to database for querying by getRegressionAlerts
            await prisma.auditLog.create({
              data: {
                companyId: company.id,
                userId: "system",
                action: "compliance.regression_detected",
                entityType: "ComplianceSnapshot",
                entityId: company.id,
                actorId: "system",
                createdBy: "system",
                timestamp: new Date(),
                metadata: {
                  companyId: company.id,
                  categories: regressedCategories,
                  previousScore: previousOverallScore,
                  currentScore: overallScore,
                  threshold,
                  snapshotDate: todayStart.toISOString(),
                },
              },
            });

            // Send alert email to all ADMINs and RISK_REVIEWERs of this company
            const admins = await prisma.user.findMany({
              where: {
                companyId: company.id,
                role: { in: ["ADMIN", "RISK_REVIEWER"] },
                isActive: true,
              },
              select: {
                email: true,
                displayName: true,
              },
            });

            // Generate and send emails
            const emailTemplate = regressionAlertEmail({
              vendorName: "Multiple Vendors", // Portfolio-level alert
              companyName: company.name ?? "Your Organization",
              categories: regressedCategories,
              fromScore: previousOverallScore,
              toScore: overallScore,
              date: todayStart.toLocaleDateString(),
            });

            for (const admin of admins) {
              if (admin.email) {
                void sendMail({
                  to: admin.email,
                  subject: emailTemplate.subject,
                  html: emailTemplate.html,
                }).catch((err) => {
                  AuditLogger.systemHealth("cron.compliance_snapshot.email_failed", "failure", {
                    details: {
                      companyId: company.id,
                      adminEmail: admin.email,
                      error: String(err),
                    },
                  });
                });
              }
            }

            AuditLogger.systemHealth("cron.compliance_snapshot.regression_alerts_sent", "success", {
              details: {
                companyId: company.id,
                categories: regressedCategories,
                recipientCount: admins.filter((a) => a.email).length,
              },
            });
          }
        }
      }

      processed++;
    }

    // System health log
    AuditLogger.systemHealth("cron.compliance_snapshot.completed", "success", {
      details: {
        snapshots: processed,
        companiesEvaluated: companies.length,
      },
    });

    return NextResponse.json({ success: true, snapshots: processed });
  } catch (err) {
    AuditLogger.systemHealth("cron.compliance_snapshot.error", "failure", {
      details: { error: String(err) },
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
