import { NextRequest, NextResponse } from "next/server";
import { deleteVendorsAction } from "@/app/actions/vendor-actions";

type DeleteVendorsBody = {
  vendorIds?: string[];
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as DeleteVendorsBody;
    const vendorIds = Array.isArray(body.vendorIds) ? body.vendorIds : [];

    if (vendorIds.length === 0 || !vendorIds.every((id) => typeof id === "string")) {
      return NextResponse.json(
        { ok: false, error: "No vendors selected for deletion." },
        { status: 400 },
      );
    }

    const result = await deleteVendorsAction(vendorIds);
    if (!result.ok) {
      const isUnauthorized = result.error === "Unauthorized.";
      return NextResponse.json(result, { status: isUnauthorized ? 403 : 400 });
    }

    return NextResponse.json(result, { status: 200 });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not delete selected vendors. Try again." },
      { status: 500 },
    );
  }
}
