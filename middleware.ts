import { NextResponse, NextRequest } from "next/server";

/**
 * Middleware to enforce the "Vault" rule for AVRA.
 * Ensures that external vendor requests stay isolated within the /external/ route tree.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const response = NextResponse.next();

  // 1. Identify External Assessment Portal
  if (pathname.startsWith("/external/assessment/")) {
    const parts = pathname.split("/");
    const token = parts[parts.length - 1]; // Assume token is the last segment
    
    if (token && token.length > 20) {
      // Safely set the session cookie in the middleware response
      response.cookies.set("avra-vendor-token", token, {
        path: "/",
        maxAge: 60 * 60 * 24, // 24 hours
        sameSite: "strict",
        secure: true,
        httpOnly: true,
      });
    }
  }

  // 2. Identify Internal Admin Routes
  const isInternalRoute = 
    pathname.startsWith("/dashboard") || 
    pathname.startsWith("/vendors") || 
    pathname.startsWith("/settings");

  // 3. Enforce "Vault" rule: If an admin route is hit with a vendor token, clear it to prevent lockout
  const vendorToken = request.cookies.get("avra-vendor-token");

  if (isInternalRoute && vendorToken) {
    // Break the redirect loop by clearing the vendor token
    // This allows admins to regain control by simply hitting /, /dashboard, or /vendors
    response.cookies.delete("avra-vendor-token");
    return response;
  }

  return response;
}

// See "Matching Paths" below to learn more
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/vendors/:path*",
    "/settings/:path*",
    "/external/:path*",
  ],
};
