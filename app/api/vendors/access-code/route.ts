import { NextRequest, NextResponse } from "next/server";
import {
  type AccessCodeDuration,
  generateVendorAccessCodeAction,
} from "@/app/actions/vendor-actions";

type GenerateAccessCodeBody = {
  vendorId?: string;
  duration?: AccessCodeDuration;
};

const VALID_DURATIONS = new Set<AccessCodeDuration>(["1h", "24h", "7d", "30d"]);

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as GenerateAccessCodeBody;
    const vendorId = typeof body.vendorId === "string" ? body.vendorId : "";
    const duration =
      typeof body.duration === "string" && VALID_DURATIONS.has(body.duration)
        ? body.duration
        : "24h";

    const result = await generateVendorAccessCodeAction(vendorId, duration);
    if (!result.ok) {
      const isUnauthorized = result.error === "Unauthorized.";
      return NextResponse.json(result, { status: isUnauthorized ? 403 : 400 });
    }

    return NextResponse.json(result, { status: 200 });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not generate access code. Try again." },
      { status: 500 },
    );
  }
}
