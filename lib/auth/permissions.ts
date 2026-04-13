import type { UserRole } from "@prisma/client";

export const INTERNAL_READ_ROLES: UserRole[] = ["ADMIN", "RISK_REVIEWER", "AUDITOR"];
export const INTERNAL_WRITE_ROLES: UserRole[] = ["ADMIN", "RISK_REVIEWER"];
export const ADMIN_ONLY_ROLES: UserRole[] = ["ADMIN"];

export function getRoleLandingPath(role: UserRole): string {
  return role === "VENDOR" ? "/external/portal" : "/dashboard";
}

export function canAccessPath(role: UserRole, normalizedPathname: string): boolean {
  if (
    normalizedPathname === "/" ||
    normalizedPathname === "/unauthorized" ||
    normalizedPathname.startsWith("/auth/sign-in") ||
    normalizedPathname.startsWith("/auth/sso")
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
    return ADMIN_ONLY_ROLES.includes(role);
  }

  if (normalizedPathname.startsWith("/admin")) {
    if (normalizedPathname === "/admin/audit-logs" || normalizedPathname.startsWith("/admin/audit-logs/")) {
      return INTERNAL_READ_ROLES.includes(role);
    }
    return ADMIN_ONLY_ROLES.includes(role);
  }

  if (normalizedPathname.startsWith("/dashboard")) {
    if (normalizedPathname === "/dashboard/users" || normalizedPathname.startsWith("/dashboard/users/")) {
      return ADMIN_ONLY_ROLES.includes(role);
    }
    return INTERNAL_READ_ROLES.includes(role);
  }

  if (normalizedPathname.startsWith("/vendors")) {
    return INTERNAL_READ_ROLES.includes(role);
  }

  if (normalizedPathname.startsWith("/reporting")) {
    return INTERNAL_READ_ROLES.includes(role);
  }

  return INTERNAL_READ_ROLES.includes(role);
}

export function isProtectedInternalPath(normalizedPathname: string): boolean {
  return (
    normalizedPathname.startsWith("/dashboard") ||
    normalizedPathname.startsWith("/vendors") ||
    normalizedPathname.startsWith("/reporting") ||
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
