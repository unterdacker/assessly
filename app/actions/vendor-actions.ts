"use server";

import crypto from "crypto";
import bcrypt from "bcryptjs";
import { revalidatePath, revalidateTag } from "next/cache";
import { RISK_POSTURE_CACHE_TAG } from "@/lib/queries/dashboard-risk-posture";
import { prisma } from "@/lib/prisma";
import { getDefaultCompanyId } from "@/lib/queries/vendor-assessments";
import { calculateRiskLevel } from "@/lib/risk-level";
import { logAuditEvent } from "@/lib/audit-log";
import { isAccessControlError, requireAdminUser } from "@/lib/auth/server";
import { AuditLogger } from "@/lib/structured-logger";
const ACCESS_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ACCESS_CODE_SCHEMA_NOT_READY = "ACCESS_CODE_SCHEMA_NOT_READY";
const TEMP_PASSWORD_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#%";

function isAccessCodeSchemaMismatch(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message;
  return (
    message.includes("Unknown argument `accessCode`") ||
    message.includes("Unknown argument `codeExpiresAt`") ||
    message.includes("Unknown argument `isCodeActive`") ||
    (message.includes("column") && message.includes("accessCode"))
  );
}

function isUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybe = error as { code?: string };
  return maybe.code === "P2002";
}

function generateAccessCode(): string {
  const chars = crypto.randomBytes(8);
  const picked = Array.from(chars, (b) => ACCESS_CODE_ALPHABET[b % ACCESS_CODE_ALPHABET.length]);
  return `${picked.slice(0, 4).join("")}-${picked.slice(4, 8).join("")}`;
}

function generateTempPassword(): string {
  const bytes = crypto.randomBytes(12);
  return Array.from(bytes, (b) => TEMP_PASSWORD_ALPHABET[b % TEMP_PASSWORD_ALPHABET.length]).join("");
}

export type CreateVendorResult =
  | { ok: true }
  | { ok: false; error: string };

export type DeleteVendorResult =
  | { ok: true }
  | { ok: false; error: string };

export type DeleteVendorsResult =
  | { ok: true; deletedCount: number }
  | { ok: false; error: string };

export type AccessCodeDuration = "1h" | "24h" | "7d" | "30d";

export type GenerateAccessCodeResult =
  | { ok: true; accessCode: string; tempPassword: string; codeExpiresAt: string }
  | { ok: false; error: string };

export type VoidAccessCodeResult =
  | { ok: true }
  | { ok: false; error: string };

function resolveCodeExpiry(duration: AccessCodeDuration): Date {
  const now = new Date();
  switch (duration) {
    case "1h":
      return new Date(now.getTime() + 60 * 60 * 1000);
    case "24h":
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    case "7d":
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    case "30d":
      return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    default:
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
  }
}

export async function createVendorAction(
  formData: FormData,
): Promise<CreateVendorResult> {
  const session = await requireAdminUser();
  const companyId = session.companyId ?? (await getDefaultCompanyId());
  if (!companyId) {
    return {
      ok: false,
      error:
        "Database is empty. Run: npx prisma migrate dev && npx prisma db seed",
    };
  }

  const name = formData.get("name");
  const email = formData.get("email");
  if (typeof name !== "string" || !name.trim()) {
    return { ok: false, error: "Organization name is required." };
  }
  if (typeof email !== "string" || !email.trim()) {
    return { ok: false, error: "Security contact email is required." };
  }

  const complianceScore = 0;
  const riskLevel = calculateRiskLevel(complianceScore);

  try {
    await prisma.$transaction(async (tx) => {
      let vendor;
      try {
        vendor = await tx.vendor.create({
          data: {
            companyId,
            name: name.trim(),
            email: email.trim().toLowerCase(),
            serviceType: "Pending classification",
            createdBy: session.userId,
            accessCode: null,
            codeExpiresAt: null,
            isCodeActive: false,
            inviteToken: null,
            inviteTokenExpires: null,
          },
        });
      } catch (error) {
        if (!isAccessCodeSchemaMismatch(error)) throw error;
        vendor = await tx.vendor.create({
          data: {
            companyId,
            name: name.trim(),
            email: email.trim().toLowerCase(),
            serviceType: "Pending classification",
            createdBy: session.userId,
            inviteToken: null,
            inviteTokenExpires: null,
          },
        });
      }

      await tx.assessment.create({
        data: {
          companyId,
          vendorId: vendor.id,
          status: "PENDING",
          riskLevel,
          complianceScore,
          lastAssessmentDate: null,
          createdBy: session.userId,
        },
      });

      await logAuditEvent(
        {
          companyId,
          userId: session.userId,
          action: "VENDOR_CREATED",
          entityType: "Vendor",
          entityId: vendor.id,
          newValue: { name: name.trim(), serviceType: "Pending classification" },
        },
        { tx, captureHeaders: true },
      );
    });

    AuditLogger.dataOp("vendor.created", "success", {
      userId: session.userId,
      entityType: "Vendor",
      message: `Vendor "${name.trim()}" created`,
    });

    revalidatePath("/dashboard");
    revalidatePath("/vendors");
    revalidateTag(RISK_POSTURE_CACHE_TAG);

    return { ok: true };
  } catch (err) {
    if (isAccessControlError(err)) {
      return { ok: false, error: "Unauthorized." };
    }
    AuditLogger.dataOp("vendor.created", "failure", {
      userId: session.userId,
      error: err instanceof Error ? err : new Error(String(err)),
      message: "Vendor creation failed",
    });
    return { ok: false, error: "Could not save vendor. Try again." };
  }
}

export async function generateVendorAccessCodeAction(
  vendorId: string,
  duration: AccessCodeDuration,
): Promise<GenerateAccessCodeResult> {
  const session = await requireAdminUser();
  if (!vendorId || !vendorId.trim()) {
    return { ok: false, error: "Invalid vendor identifier." };
  }

  const companyId = session.companyId ?? (await getDefaultCompanyId());
  if (!companyId) {
    return {
      ok: false,
      error: "Database is empty. Run: npx prisma migrate dev && npx prisma db seed",
    };
  }

  try {
    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    let accessCode = "";
    const codeExpiresAt = resolveCodeExpiry(duration);
    const inviteToken = crypto.randomUUID().replace(/-/g, "");

    await prisma.$transaction(async (tx) => {
      const vendor = await tx.vendor.findFirst({
        where: { id: vendorId, companyId },
        select: { id: true, name: true },
      });

      if (!vendor) {
        throw new Error("Vendor not found.");
      }

      let updated = false;
      for (let i = 0; i < 10; i++) {
        accessCode = generateAccessCode();
        try {
          await tx.vendor.update({
            where: { id: vendor.id },
            data: {
              accessCode,
              codeExpiresAt,
              isCodeActive: true,
              inviteToken,
              inviteTokenExpires: codeExpiresAt,
              passwordHash,
              isFirstLogin: true,
              inviteSentAt: new Date(),
            },
          });
          updated = true;
          break;
        } catch (error) {
          if (isUniqueConstraintError(error)) {
            continue;
          }
          if (isAccessCodeSchemaMismatch(error)) {
            throw new Error(ACCESS_CODE_SCHEMA_NOT_READY);
          }
          throw error;
        }
      }

      if (!updated) {
        throw new Error("Failed to generate a unique access code.");
      }

      await logAuditEvent(
        {
          companyId,
          userId: session.userId,
          action: "ACCESS_CODE_GENERATED",
          entityType: "vendor_access_code",
          entityId: vendor.id,
          previousValue: {
            status: "none",
            isCodeActive: false,
            codeExpiresAt: null,
          },
          newValue: {
            status: "active",
            isCodeActive: true,
            codeExpiresAt: codeExpiresAt.toISOString(),
            duration,
            masked_access_code: accessCode.slice(0, 2) + "****-****",
          },
        },
        { tx, captureHeaders: true },
      );

      console.log(`[SIMULATED EMAIL] Assessment Invitation for ${vendor.name}`);
      console.log(
        `[TEMPLATE] You have been invited to an assessment. Visit assessly.app/portal and use your temporary access code: ${accessCode}.`,
      );
      console.log(`[EXPIRY] ${codeExpiresAt.toISOString()}`);
    });

    revalidatePath("/vendors");
    return { ok: true, accessCode, tempPassword, codeExpiresAt: codeExpiresAt.toISOString() };
  } catch (err) {
    if (isAccessControlError(err)) {
      return { ok: false, error: "Unauthorized." };
    }
    AuditLogger.dataOp("vendor.access_code_generated", "failure", {
      userId: session.userId,
      entityType: "Vendor",
      entityId: vendorId,
      error: err instanceof Error ? err : new Error(String(err)),
      message: "Access code generation failed",
    });
    if (
      (err instanceof Error && err.message === ACCESS_CODE_SCHEMA_NOT_READY) ||
      isAccessCodeSchemaMismatch(err)
    ) {
      return {
        ok: false,
        error:
          "Access code feature is not ready yet. Run: npx prisma migrate dev && npx prisma generate",
      };
    }
    return { ok: false, error: "Could not generate access code. Try again." };
  }
}

export async function voidVendorAccessCodeAction(vendorId: string): Promise<VoidAccessCodeResult> {
  const session = await requireAdminUser();
  if (!vendorId || !vendorId.trim()) {
    return { ok: false, error: "Invalid vendor identifier." };
  }

  const companyId = session.companyId ?? (await getDefaultCompanyId());
  if (!companyId) {
    return {
      ok: false,
      error: "Database is empty. Run: npx prisma migrate dev && npx prisma db seed",
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const vendor = await tx.vendor.findFirst({
        where: { id: vendorId, companyId },
        select: { id: true, isFirstLogin: true },
      });

      if (!vendor) {
        throw new Error("Vendor not found.");
      }

      const resetPendingInviteState = Boolean(vendor.isFirstLogin);

      await tx.vendor.update({
        where: { id: vendor.id },
        data: {
          isCodeActive: false,
          codeExpiresAt: null,
          accessCode: null,
          inviteToken: null,
          inviteTokenExpires: null,
          ...(resetPendingInviteState
            ? {
                inviteSentAt: null,
                passwordHash: null,
              }
            : {}),
        },
      });

      await logAuditEvent(
        {
          companyId,
          userId: session.userId,
          action: "ACCESS_CODE_VOIDED",
          entityType: "Vendor",
          entityId: vendor.id,
          newValue: { isCodeActive: false },
        },
        { tx, captureHeaders: true },
      );
    });

    AuditLogger.dataOp("vendor.access_code.voided", "success", {
      userId: session.userId,
      entityType: "Vendor",
      entityId: vendorId,
      message: "Vendor access code voided",
    });

    revalidatePath("/vendors");
    return { ok: true };
  } catch (err) {
    if (isAccessControlError(err)) {
      return { ok: false, error: "Unauthorized." };
    }
    AuditLogger.dataOp("vendor.access_code_voided", "failure", {
      userId: session.userId,
      entityType: "Vendor",
      entityId: vendorId,
      error: err instanceof Error ? err : new Error(String(err)),
      message: "Void access code failed",
    });
    if (isAccessCodeSchemaMismatch(err)) {
      return {
        ok: false,
        error:
          "Access code feature is not ready yet. Run: npx prisma migrate dev && npx prisma generate",
      };
    }
    return { ok: false, error: "Could not void access code. Try again." };
  }
}

export async function deleteVendorAction(vendorId: string): Promise<DeleteVendorResult> {
  const session = await requireAdminUser();
  if (!vendorId || !vendorId.trim()) {
    return { ok: false, error: "Invalid vendor identifier." };
  }

  const companyId = session.companyId ?? (await getDefaultCompanyId());
  if (!companyId) {
    return {
      ok: false,
      error: "Database is empty. Run: npx prisma migrate dev && npx prisma db seed",
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const vendor = await tx.vendor.findFirst({
        where: { id: vendorId, companyId },
        select: { id: true, name: true },
      });

      if (!vendor) {
        throw new Error("Vendor not found.");
      }

      await tx.vendor.delete({ where: { id: vendor.id } });

      await logAuditEvent(
        {
          companyId,
          userId: session.userId,
          action: "VENDOR_DELETED",
          entityType: "Vendor",
          entityId: vendor.id,
          previousValue: { name: vendor.name },
          newValue: { deleted: true },
        },
        { tx, captureHeaders: true },
      );
    });

    AuditLogger.dataOp("vendor.deleted", "success", {
      userId: session.userId,
      entityType: "Vendor",
      entityId: vendorId,
      message: "Vendor deleted",
    });

    revalidatePath("/dashboard");
    revalidatePath("/vendors");
    revalidateTag(RISK_POSTURE_CACHE_TAG);

    return { ok: true };
  } catch (err) {
    if (isAccessControlError(err)) {
      return { ok: false, error: "Unauthorized." };
    }
    AuditLogger.dataOp("vendor.deleted", "failure", {
      userId: session.userId,
      entityType: "Vendor",
      entityId: vendorId,
      error: err instanceof Error ? err : new Error(String(err)),
      message: "Vendor deletion failed",
    });
    return { ok: false, error: "Could not delete vendor. Try again." };
  }
}

export async function deleteVendorsAction(vendorIds: string[]): Promise<DeleteVendorsResult> {
  const session = await requireAdminUser();
  const uniqueIds = [...new Set(vendorIds.map((id) => id.trim()).filter(Boolean))];
  if (uniqueIds.length === 0) {
    return { ok: false, error: "No vendors selected for deletion." };
  }

  const companyId = session.companyId ?? (await getDefaultCompanyId());
  if (!companyId) {
    return {
      ok: false,
      error: "Database is empty. Run: npx prisma migrate dev && npx prisma db seed",
    };
  }

  try {
    const deletedCount = await prisma.$transaction(async (tx) => {
      const vendors = await tx.vendor.findMany({
        where: { id: { in: uniqueIds }, companyId },
        select: { id: true, name: true },
      });

      if (vendors.length === 0) {
        throw new Error("Selected vendors not found.");
      }

      await tx.vendor.deleteMany({
        where: { id: { in: vendors.map((v) => v.id) }, companyId },
      });

      for (const vendor of vendors) {
        await logAuditEvent(
          {
            companyId,
            userId: session.userId,
            action: "VENDOR_DELETED",
            entityType: "Vendor",
            entityId: vendor.id,
            previousValue: { name: vendor.name },
            newValue: { deleted: true, bulk: true },
          },
          { tx, captureHeaders: true },
        );
      }

      return vendors.length;
    });

    AuditLogger.dataOp("vendor.bulk_deleted", "success", {
      userId: session.userId,
      entityType: "Vendor",
      message: `${deletedCount} vendors deleted in bulk`,
      details: { deletedCount },
    });

    revalidatePath("/dashboard");
    revalidatePath("/vendors");
    revalidateTag(RISK_POSTURE_CACHE_TAG);

    return { ok: true, deletedCount };
  } catch (err) {
    if (isAccessControlError(err)) {
      return { ok: false, error: "Unauthorized." };
    }
    AuditLogger.dataOp("vendor.bulk_deleted", "failure", {
      userId: session.userId,
      error: err instanceof Error ? err : new Error(String(err)),
      message: "Bulk vendor deletion failed",
    });
    return { ok: false, error: "Could not delete selected vendors. Try again." };
  }
}
