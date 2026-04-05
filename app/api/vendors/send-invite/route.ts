import { NextRequest, NextResponse } from "next/server";
import { sendOutOfBandInviteAction } from "@/app/actions/send-invite";
import type { SendInviteState } from "@/lib/types/vendor-auth";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const idle: SendInviteState = { status: "idle", error: null };
    const result = await sendOutOfBandInviteAction(idle, formData);
    const status = result.status === "error" ? 400 : 200;
    return NextResponse.json(result, { status });
  } catch {
    return NextResponse.json(
      { status: "error", error: "Could not send invite. Try again." },
      { status: 500 },
    );
  }
}
