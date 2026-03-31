import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AUTH_SESSION_COOKIE_NAME } from "@/lib/auth/token";

/**
 * API route to securely terminate an external vendor session.
 * Clears the 'avra-vendor-token' cookie and redirects to the home page.
 */
export async function GET() {
  const cookieStore = await cookies();
  cookieStore.delete("avra-vendor-token");
  cookieStore.delete(AUTH_SESSION_COOKIE_NAME);
  
  // Redirect to a neutral external exit page, not the internal admin console.
  return NextResponse.redirect(new URL("/external/exit", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"));
}
