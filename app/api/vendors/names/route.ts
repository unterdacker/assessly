import { NextResponse } from "next/server";
import { isAccessControlError, requireInternalReadUser } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

// GET /api/vendors/names
// Returns minimal vendor list for command palette autocomplete
// Auth: INTERNAL_READ_ROLES, tenant-scoped
export async function GET() {
  try {
    const session = await requireInternalReadUser();
    if (!session.companyId) {
      return NextResponse.json(
        { ok: false, error: "Forbidden." },
        { status: 403, headers: NO_STORE_HEADERS },
      );
    }

    const vendors = await prisma.vendor.findMany({
      where: { companyId: session.companyId },
      select: { id: true, name: true, serviceType: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ ok: true, vendors }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    if (isAccessControlError(err)) {
      return NextResponse.json(
        { ok: false, error: "Forbidden." },
        { status: 403, headers: NO_STORE_HEADERS },
      );
    }

    return NextResponse.json(
      { ok: false, error: "Failed to load vendors." },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
