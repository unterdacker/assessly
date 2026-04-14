import { NextRequest, NextResponse } from "next/server";
import { sendOutOfBandInviteAction } from "@/app/actions/send-invite";
import type { SendInviteState } from "@/lib/types/vendor-auth";
import { logErrorReport } from "@/lib/logger";

// Allowlist prevents parameter injection when the JSON→FormData bridge is used.
const ALLOWED_JSON_KEYS = new Set([
  "vendorId",
  "email",
  "duration",
  "locale",
  "forceRefresh",
]);

export async function POST(request: NextRequest) {
  try {
    const ct = request.headers.get("content-type") ?? "";
    let formData: FormData;

    if (ct.includes("application/json")) {
      // Guard against oversized payloads by measuring the actual buffered body,
      // not the client-controlled Content-Length header.
      const bodyText = await request.text();
      if (bodyText.length > 8_192) {
        return NextResponse.json(
          { status: "error", error: "Payload too large." },
          { status: 413 },
        );
      }
      const raw = JSON.parse(bodyText) as Record<string, unknown>;
      formData = new FormData();
      // F3: only copy explicitly allowed keys to prevent parameter injection.
      for (const [key, value] of Object.entries(raw)) {
        if (ALLOWED_JSON_KEYS.has(key) && value != null) {
          formData.set(key, String(value));
        }
      }
    } else {
      formData = await request.formData();
    }

    const idle: SendInviteState = { status: "idle", error: null };
    const result = await sendOutOfBandInviteAction(idle, formData);
    const status = result.status === "error" ? 400 : 200;
    return NextResponse.json(result, { status });
  } catch (err) {
    logErrorReport("api.vendors.send-invite", err);
    return NextResponse.json(
      { status: "error", error: "Could not send invite. Try again." },
      { status: 500 },
    );
  }
}
