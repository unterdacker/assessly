import { NextRequest, NextResponse } from "next/server";
import { voidVendorAccessCodeAction } from "@/app/actions/vendor-actions";
import { logErrorReport } from "@/lib/logger";

type VoidCodeBody = {
  vendorId?: string;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as VoidCodeBody;
    const vendorId = typeof body.vendorId === "string" ? body.vendorId.trim() : "";

    if (!vendorId) {
      return NextResponse.json(
        { ok: false, error: "Invalid vendor identifier." },
        { status: 400 },
      );
    }

    const result = await voidVendorAccessCodeAction(vendorId);
    if (!result.ok) {
      const isUnauthorized = result.error === "Unauthorized.";
      return NextResponse.json(result, { status: isUnauthorized ? 403 : 400 });
    }

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    logErrorReport("api.vendors.void-code", err);
    return NextResponse.json(
      { ok: false, error: "Could not void access code. Try again." },
      { status: 500 },
    );
  }
}
