import { describe, expect, it } from "vitest";
import {
  canAccessPath,
  getRoleLandingPath,
  isExternalPath,
  isProtectedInternalPath,
  withLocalePath,
} from "@/lib/auth/permissions";

describe("getRoleLandingPath", () => {
  it("returns expected home path per role", () => {
    expect(getRoleLandingPath("VENDOR")).toBe("/external/portal");
    expect(getRoleLandingPath("ADMIN")).toBe("/dashboard");
    expect(getRoleLandingPath("RISK_REVIEWER")).toBe("/dashboard");
    expect(getRoleLandingPath("AUDITOR")).toBe("/dashboard");
  });
});

describe("canAccessPath", () => {
  it("allows public routes for all roles", () => {
    expect(canAccessPath("VENDOR", "/")).toBe(true);
    expect(canAccessPath("RISK_REVIEWER", "/")).toBe(true);
    expect(canAccessPath("ADMIN", "/")).toBe(true);
    expect(canAccessPath("VENDOR", "/unauthorized")).toBe(true);
    expect(canAccessPath("RISK_REVIEWER", "/unauthorized")).toBe(true);
    expect(canAccessPath("VENDOR", "/auth/sign-in")).toBe(true);
    expect(canAccessPath("RISK_REVIEWER", "/auth/sign-in")).toBe(true);
    expect(canAccessPath("ADMIN", "/auth/sign-in")).toBe(true);
  });

  it("applies external portal access rules", () => {
    expect(canAccessPath("VENDOR", "/portal")).toBe(true);
    expect(canAccessPath("ADMIN", "/portal")).toBe(false);
    expect(canAccessPath("RISK_REVIEWER", "/portal")).toBe(false);
    expect(canAccessPath("AUDITOR", "/portal")).toBe(false);
    expect(canAccessPath("VENDOR", "/external/anything")).toBe(true);
    expect(canAccessPath("ADMIN", "/external/anything")).toBe(false);
    expect(canAccessPath("RISK_REVIEWER", "/external/anything")).toBe(false);
  });

  it("applies settings access rules", () => {
    expect(canAccessPath("ADMIN", "/settings")).toBe(true);
    expect(canAccessPath("AUDITOR", "/settings")).toBe(false);
    expect(canAccessPath("RISK_REVIEWER", "/settings")).toBe(false);
    expect(canAccessPath("VENDOR", "/settings")).toBe(false);
  });

  it("applies admin/users access rules", () => {
    expect(canAccessPath("ADMIN", "/admin/users")).toBe(true);
    expect(canAccessPath("RISK_REVIEWER", "/admin/users")).toBe(false);
    expect(canAccessPath("AUDITOR", "/admin/users")).toBe(false);
    expect(canAccessPath("VENDOR", "/admin/users")).toBe(false);
  });

  it("applies admin/audit-logs access rules", () => {
    expect(canAccessPath("ADMIN", "/admin/audit-logs")).toBe(true);
    expect(canAccessPath("RISK_REVIEWER", "/admin/audit-logs")).toBe(true);
    expect(canAccessPath("AUDITOR", "/admin/audit-logs")).toBe(true);
    expect(canAccessPath("VENDOR", "/admin/audit-logs")).toBe(false);
  });

  it("applies internal dashboard/vendor access rules", () => {
    expect(canAccessPath("ADMIN", "/dashboard")).toBe(true);
    expect(canAccessPath("RISK_REVIEWER", "/dashboard")).toBe(true);
    expect(canAccessPath("AUDITOR", "/dashboard")).toBe(true);
    expect(canAccessPath("VENDOR", "/dashboard")).toBe(false);
    expect(canAccessPath("ADMIN", "/vendors/test")).toBe(true);
    expect(canAccessPath("RISK_REVIEWER", "/vendors/test")).toBe(true);
    expect(canAccessPath("VENDOR", "/vendors/test")).toBe(false);
  });

  it("allows unknown non-protected routes via default fallback", () => {
    expect(canAccessPath("VENDOR", "/totally-custom")).toBe(false);
    expect(canAccessPath("ADMIN", "/totally-custom")).toBe(true);
  });
});

describe("isProtectedInternalPath", () => {
  it("detects protected internal routes", () => {
    expect(isProtectedInternalPath("/dashboard")).toBe(true);
    expect(isProtectedInternalPath("/vendors/test")).toBe(true);
    expect(isProtectedInternalPath("/settings")).toBe(true);
    expect(isProtectedInternalPath("/admin")).toBe(true);
    expect(isProtectedInternalPath("/auth/sign-in")).toBe(false);
  });
});

describe("isExternalPath", () => {
  it("detects external routes", () => {
    expect(isExternalPath("/portal")).toBe(true);
    expect(isExternalPath("/external/foo")).toBe(true);
    expect(isExternalPath("/dashboard")).toBe(false);
  });
});

describe("withLocalePath", () => {
  it("prefixes locale path correctly", () => {
    expect(withLocalePath("/dashboard", "en")).toBe("/en/dashboard");
    expect(withLocalePath("/", "de")).toBe("/de");
    expect(withLocalePath("/settings", "de")).toBe("/de/settings");
  });
});
