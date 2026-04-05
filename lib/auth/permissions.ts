import type { UserRole } from "@prisma/client";

export const INTERNAL_READ_ROLES: UserRole[] = ["ADMIN", "AUDITOR"];
export const ADMIN_ONLY_ROLES: UserRole[] = ["ADMIN"];

export function getRoleLandingPath(role: UserRole): string {
  return role === "VENDOR" ? "/external/portal" : "/dashboard";
}

export function canAccessPath(role: UserRole, normalizedPathname: string): boolean {
  if (
    normalizedPathname === "/" ||
    normalizedPathname === "/unauthorized" ||
    normalizedPathname.startsWith("/auth/sign-in")
  ) {
    return true;
  }

  if (
    normalizedPathname === "/portal" ||
    normalizedPathname.startsWith("/external/")
  ) {
    return role === "VENDOR";
  }

  if (normalizedPathname.startsWith("/settings")) {
    return role === "ADMIN" || role === "AUDITOR";
  }

  if (normalizedPathname.startsWith("/admin")) {
    if (normalizedPathname === "/admin/audit-logs" || normalizedPathname.startsWith("/admin/audit-logs/")) {
      return role === "ADMIN" || role === "AUDITOR";
    }
    return role === "ADMIN";
  }

  if (
    normalizedPathname.startsWith("/dashboard") ||
    normalizedPathname.startsWith("/vendors")
  ) {
    return role === "ADMIN" || role === "AUDITOR";
  }

  return true;
}

export function isProtectedInternalPath(normalizedPathname: string): boolean {
  return (
    normalizedPathname.startsWith("/dashboard") ||
    normalizedPathname.startsWith("/vendors") ||
    normalizedPathname.startsWith("/settings") ||
    normalizedPathname.startsWith("/admin")
  );
}

export function isExternalPath(normalizedPathname: string): boolean {
  return normalizedPathname === "/portal" || normalizedPathname.startsWith("/external/");
}

export function withLocalePath(pathname: string, locale: string): string {
  return `/${locale}${pathname === "/" ? "" : pathname}`;
}