import { cookies } from "next/headers";
import { NextResponse } from "next/server";

/**
 * API route to securely terminate an external vendor session.
 * Clears the 'avra-vendor-token' cookie and redirects to the home page.
 */
export async function GET() {
  const cookieStore = await cookies();
  cookieStore.delete("avra-vendor-token");
  
  // Redirect back to the main AVRA dashboard/home
  return NextResponse.redirect(new URL("/", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"));
}
