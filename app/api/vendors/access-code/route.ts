import { NextRequest, NextResponse } from "next/server";
import {
  type AccessCodeDuration,
  generateVendorAccessCodeAction,
} from "@/app/actions/vendor-actions";
import { logErrorReport } from "@/lib/logger";
import { isRateLimited, registerFailure, readClientIp } from "@/lib/rate-limit";
import { AuditLogger } from "@/lib/structured-logger";
import { truncateIp } from "@/lib/audit-sanitize";

type GenerateAccessCodeBody = {
  vendorId?: string;
  duration?: AccessCodeDuration;
};

const VALID_DURATIONS = new Set<AccessCodeDuration>(["1h", "24h", "7d", "30d"]);

export async function POST(request: NextRequest) {
  const rawIp = readClientIp(request.headers);
  const rlKey = `acg:${rawIp}`;
  if (isRateLimited(rlKey)) {
    AuditLogger.auth("rate_limit.exceeded", "failure", {
      sourceIp: truncateIp(rawIp),
      message: "Access-code generate: per-IP rate limit exceeded",
      details: { key: rlKey },
    });
    return NextResponse.json(
      { ok: false, error: "Too many requests. Try again later." },
      { status: 429 },
    );
  }

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
      registerFailure(rlKey, { maxFailures: 20, blockMs: 60 * 1000 });
      return NextResponse.json(result, { status: isUnauthorized ? 403 : 400 });
    }

    registerFailure(rlKey, { maxFailures: 20, blockMs: 60 * 1000 });
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    logErrorReport("api.vendors.access-code", err);
    registerFailure(rlKey, { maxFailures: 20, blockMs: 60 * 1000 });
    return NextResponse.json(
      { ok: false, error: "Could not generate access code. Try again." },
      { status: 500 },
    );
  }
}
