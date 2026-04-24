import { type NextRequest, NextResponse } from "next/server";
import { sendOutOfBandInviteAction } from "@/app/actions/send-invite";
import { isAccessControlError, requireAdminUser } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";
import { isRateLimited, registerFailure } from "@/lib/rate-limit";
import type { SendInviteState } from "@/lib/types/vendor-auth";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };
const BULK_INVITE_LIMIT = 50;
const RATE_LIMIT_BLOCK_SECONDS = 300;

type BulkInviteRequest = {
  vendorIds?: unknown;
};

export async function POST(request: NextRequest) {
  try {
    const session = await requireAdminUser();
    if (!session.companyId) {
      return NextResponse.json(
        { ok: false, error: "Forbidden." },
        { status: 403, headers: NO_STORE_HEADERS },
      );
    }

    const rateLimitKey = `bulk-invite:${session.companyId}`;
    if (isRateLimited(rateLimitKey)) {
      return NextResponse.json(
        { ok: false, error: "Too many invites. Try again later." },
        {
          status: 429,
          headers: {
            ...NO_STORE_HEADERS,
            "Retry-After": String(RATE_LIMIT_BLOCK_SECONDS),
          },
        },
      );
    }

    const body = (await request.json()) as BulkInviteRequest;
    const rawVendorIds = Array.isArray(body.vendorIds) ? body.vendorIds : [];
    const vendorIds = Array.from(
      new Set(rawVendorIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)),
    );

    if (vendorIds.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No vendors selected." },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    if (vendorIds.length > BULK_INVITE_LIMIT) {
      return NextResponse.json(
        { ok: false, error: "Maximum 50 vendors per bulk invite." },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    const vendors = await prisma.vendor.findMany({
      where: {
        companyId: session.companyId,
        id: { in: vendorIds },
      },
      select: {
        id: true,
        email: true,
      },
    });

    const vendorsById = new Map(vendors.map((vendor) => [vendor.id, vendor]));

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const vendorId of vendorIds) {
      const vendor = vendorsById.get(vendorId);
      if (!vendor) {
        failed += 1;
        continue;
      }

      const email = vendor.email?.trim();
      if (!email) {
        skipped += 1;
        continue;
      }

      const formData = new FormData();
      formData.set("vendorId", vendor.id);
      formData.set("email", email);
      formData.set("duration", "24h");
      formData.set("locale", "en");

      const idleState: SendInviteState = { status: "idle", error: null };
      const result = await sendOutOfBandInviteAction(idleState, formData);

      if (result.status === "sent") {
        sent += 1;
        // Fixed-window counter via registerFailure (semantic inversion: used as per-operation counter, not failure counter). Effective limit: 20 invites per 5-min window per company. In multi-replica deployments, limit multiplies by replica count.
        registerFailure(rateLimitKey, { maxFailures: 20, blockMs: 300_000 });
      } else {
        failed += 1;
      }
    }

    return NextResponse.json(
      { sent, skipped, failed },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  } catch (err) {
    if (isAccessControlError(err)) {
      return NextResponse.json(
        { ok: false, error: "Forbidden." },
        { status: 403, headers: NO_STORE_HEADERS },
      );
    }

    return NextResponse.json(
      { ok: false, error: "Bulk invite failed." },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
