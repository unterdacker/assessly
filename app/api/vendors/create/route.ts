import { NextRequest, NextResponse } from "next/server";
import { createVendorAction } from "@/app/actions/vendor-actions";
import { logErrorReport } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const result = await createVendorAction(formData);
    if (!result.ok) {
      const isUnauthorized = result.error === "Unauthorized.";
      return NextResponse.json(result, { status: isUnauthorized ? 403 : 400 });
    }

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    logErrorReport("api.vendors.create", err);
    return NextResponse.json(
      { ok: false, error: "Could not save vendor. Try again." },
      { status: 500 },
    );
  }
}
