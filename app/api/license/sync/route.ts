import "server-only";
import { NextResponse } from "next/server";
import { performHeartbeat } from "@/lib/license/heartbeat";

export const runtime = "nodejs";

export async function POST() {
  try {
    await performHeartbeat();
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
}
