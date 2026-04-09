import { describe, expect, it } from "vitest";
import {
  ADMIN_ONLY_ROLES,
  INTERNAL_READ_ROLES,
  INTERNAL_WRITE_ROLES,
  canAccessPath,
  getRoleLandingPath,
  isExternalPath,
  isProtectedInternalPath,
  withLocalePath,
} from "@/lib/auth/permissions";

describe("INTERNAL_READ_ROLES", () => {
  it("includes SUPER_ADMIN, ADMIN, RISK_REVIEWER, AUDITOR", () => {
    expect(INTERNAL_READ_ROLES).toContain("SUPER_ADMIN");
    expect(INTERNAL_READ_ROLES).toContain("ADMIN");
    expect(INTERNAL_READ_ROLES).toContain("RISK_REVIEWER");
    expect(INTERNAL_READ_ROLES).toContain("AUDITOR");
  });

  it("excludes VENDOR", () => {
    expect(INTERNAL_READ_ROLES).not.toContain("VENDOR");
  });
});

describe("INTERNAL_WRITE_ROLES", () => {
  it("includes SUPER_ADMIN, ADMIN, RISK_REVIEWER", () => {
    expect(INTERNAL_WRITE_ROLES).toContain("SUPER_ADMIN");
    expect(INTERNAL_WRITE_ROLES).toContain("ADMIN");
    expect(INTERNAL_WRITE_ROLES).toContain("RISK_REVIEWER");
  });

  it("excludes AUDITOR and VENDOR", () => {
    expect(INTERNAL_WRITE_ROLES).not.toContain("AUDITOR");
    expect(INTERNAL_WRITE_ROLES).not.toContain("VENDOR");
  });
});

describe("ADMIN_ONLY_ROLES", () => {
  it("includes SUPER_ADMIN and ADMIN", () => {
    expect(ADMIN_ONLY_ROLES).toContain("SUPER_ADMIN");
    expect(ADMIN_ONLY_ROLES).toContain("ADMIN");
  });

  it("excludes RISK_REVIEWER, AUDITOR, VENDOR", () => {
    expect(ADMIN_ONLY_ROLES).not.toContain("RISK_REVIEWER");
    expect(ADMIN_ONLY_ROLES).not.toContain("AUDITOR");
    expect(ADMIN_ONLY_ROLES).not.toContain("VENDOR");
  });
});

describe("getRoleLandingPath", () => {
  it("returns /external/portal for VENDOR", () => {
    expect(getRoleLandingPath("VENDOR")).toBe("/external/portal");
  });

  it("returns /dashboard for all internal roles", () => {
    expect(getRoleLandingPath("SUPER_ADMIN")).toBe("/dashboard");
    expect(getRoleLandingPath("ADMIN")).toBe("/dashboard");
    expect(getRoleLandingPath("RISK_REVIEWER")).toBe("/dashboard");
    expect(getRoleLandingPath("AUDITOR")).toBe("/dashboard");
  });
});

describe("canAccessPath", () => {
  describe("public routes", () => {
    it("allows all five roles", () => {
      const publicPaths = ["/", "/unauthorized", "/auth/sign-in", "/auth/sign-in/mfa", "/auth/sso/callback"];
      for (const path of publicPaths) {
        expect(canAccessPath("SUPER_ADMIN", path), `SUPER_ADMIN ${path}`).toBe(true);
        expect(canAccessPath("ADMIN", path), `ADMIN ${path}`).toBe(true);
        expect(canAccessPath("RISK_REVIEWER", path), `RISK_REVIEWER ${path}`).toBe(true);
        expect(canAccessPath("AUDITOR", path), `AUDITOR ${path}`).toBe(true);
        expect(canAccessPath("VENDOR", path), `VENDOR ${path}`).toBe(true);
      }
    });
  });

  describe("/external/portal and /portal", () => {
    it("allows VENDOR", () => {
      expect(canAccessPath("VENDOR", "/external/portal")).toBe(true);
      expect(canAccessPath("VENDOR", "/portal")).toBe(true);
      expect(canAccessPath("VENDOR", "/external/foo/bar")).toBe(true);
    });

    it("blocks SUPER_ADMIN, ADMIN, RISK_REVIEWER, AUDITOR", () => {
      expect(canAccessPath("SUPER_ADMIN", "/external/portal")).toBe(false);
      expect(canAccessPath("ADMIN", "/external/portal")).toBe(false);
      expect(canAccessPath("RISK_REVIEWER", "/external/portal")).toBe(false);
      expect(canAccessPath("AUDITOR", "/external/portal")).toBe(false);
      expect(canAccessPath("SUPER_ADMIN", "/portal")).toBe(false);
      expect(canAccessPath("ADMIN", "/portal")).toBe(false);
      expect(canAccessPath("RISK_REVIEWER", "/portal")).toBe(false);
      expect(canAccessPath("AUDITOR", "/portal")).toBe(false);
    });
  });

  describe("/settings", () => {
    it("allows SUPER_ADMIN, ADMIN", () => {
      expect(canAccessPath("SUPER_ADMIN", "/settings")).toBe(true);
      expect(canAccessPath("ADMIN", "/settings")).toBe(true);
      expect(canAccessPath("SUPER_ADMIN", "/settings/profile")).toBe(true);
      expect(canAccessPath("ADMIN", "/settings/profile")).toBe(true);
    });

    it("blocks RISK_REVIEWER, AUDITOR, VENDOR — regression: AUDITOR no longer has settings access", () => {
      expect(canAccessPath("RISK_REVIEWER", "/settings")).toBe(false);
      expect(canAccessPath("AUDITOR", "/settings")).toBe(false);
      expect(canAccessPath("VENDOR", "/settings")).toBe(false);
    });
  });

  describe("/admin/audit-logs", () => {
    it("allows SUPER_ADMIN, ADMIN, RISK_REVIEWER, AUDITOR", () => {
      expect(canAccessPath("SUPER_ADMIN", "/admin/audit-logs")).toBe(true);
      expect(canAccessPath("ADMIN", "/admin/audit-logs")).toBe(true);
      expect(canAccessPath("RISK_REVIEWER", "/admin/audit-logs")).toBe(true);
      expect(canAccessPath("AUDITOR", "/admin/audit-logs")).toBe(true);
      expect(canAccessPath("SUPER_ADMIN", "/admin/audit-logs/123")).toBe(true);
      expect(canAccessPath("AUDITOR", "/admin/audit-logs/123")).toBe(true);
    });

    it("blocks VENDOR", () => {
      expect(canAccessPath("VENDOR", "/admin/audit-logs")).toBe(false);
      expect(canAccessPath("VENDOR", "/admin/audit-logs/123")).toBe(false);
    });
  });

  describe("/admin (non-audit-logs)", () => {
    it("allows SUPER_ADMIN, ADMIN", () => {
      expect(canAccessPath("SUPER_ADMIN", "/admin/system")).toBe(true);
      expect(canAccessPath("ADMIN", "/admin/system")).toBe(true);
    });

    it("blocks RISK_REVIEWER, AUDITOR, VENDOR", () => {
      expect(canAccessPath("RISK_REVIEWER", "/admin/system")).toBe(false);
      expect(canAccessPath("AUDITOR", "/admin/system")).toBe(false);
      expect(canAccessPath("VENDOR", "/admin/system")).toBe(false);
    });
  });

  describe("/dashboard/users", () => {
    it("allows SUPER_ADMIN, ADMIN", () => {
      expect(canAccessPath("SUPER_ADMIN", "/dashboard/users")).toBe(true);
      expect(canAccessPath("ADMIN", "/dashboard/users")).toBe(true);
      expect(canAccessPath("SUPER_ADMIN", "/dashboard/users/456")).toBe(true);
      expect(canAccessPath("ADMIN", "/dashboard/users/456")).toBe(true);
    });

    it("blocks RISK_REVIEWER, AUDITOR, VENDOR", () => {
      expect(canAccessPath("RISK_REVIEWER", "/dashboard/users")).toBe(false);
      expect(canAccessPath("AUDITOR", "/dashboard/users")).toBe(false);
      expect(canAccessPath("VENDOR", "/dashboard/users")).toBe(false);
      expect(canAccessPath("RISK_REVIEWER", "/dashboard/users/456")).toBe(false);
    });
  });

  describe("/dashboard (non-users)", () => {
    it("allows SUPER_ADMIN, ADMIN, RISK_REVIEWER, AUDITOR", () => {
      expect(canAccessPath("SUPER_ADMIN", "/dashboard")).toBe(true);
      expect(canAccessPath("ADMIN", "/dashboard")).toBe(true);
      expect(canAccessPath("RISK_REVIEWER", "/dashboard")).toBe(true);
      expect(canAccessPath("AUDITOR", "/dashboard")).toBe(true);
      expect(canAccessPath("RISK_REVIEWER", "/dashboard/overview")).toBe(true);
      expect(canAccessPath("AUDITOR", "/dashboard/overview")).toBe(true);
    });

    it("blocks VENDOR", () => {
      expect(canAccessPath("VENDOR", "/dashboard")).toBe(false);
      expect(canAccessPath("VENDOR", "/dashboard/overview")).toBe(false);
    });
  });

  describe("/vendors", () => {
    it("allows SUPER_ADMIN, ADMIN, RISK_REVIEWER, AUDITOR", () => {
      expect(canAccessPath("SUPER_ADMIN", "/vendors")).toBe(true);
      expect(canAccessPath("ADMIN", "/vendors")).toBe(true);
      expect(canAccessPath("RISK_REVIEWER", "/vendors")).toBe(true);
      expect(canAccessPath("AUDITOR", "/vendors")).toBe(true);
      expect(canAccessPath("RISK_REVIEWER", "/vendors/abc")).toBe(true);
    });

    it("blocks VENDOR", () => {
      expect(canAccessPath("VENDOR", "/vendors")).toBe(false);
      expect(canAccessPath("VENDOR", "/vendors/abc")).toBe(false);
    });
  });

  describe("unknown routes (default fallback)", () => {
    it("allows internal roles on unclassified paths", () => {
      expect(canAccessPath("SUPER_ADMIN", "/totally-custom")).toBe(true);
      expect(canAccessPath("ADMIN", "/totally-custom")).toBe(true);
      expect(canAccessPath("RISK_REVIEWER", "/totally-custom")).toBe(true);
      expect(canAccessPath("AUDITOR", "/totally-custom")).toBe(true);
    });

    it("blocks VENDOR on unclassified paths", () => {
      expect(canAccessPath("VENDOR", "/totally-custom")).toBe(false);
      expect(canAccessPath("VENDOR", "/public/page")).toBe(false);
    });
  });
});

describe("isProtectedInternalPath", () => {
  it("detects protected internal routes", () => {
    expect(isProtectedInternalPath("/dashboard")).toBe(true);
    expect(isProtectedInternalPath("/vendors/test")).toBe(true);
    expect(isProtectedInternalPath("/settings")).toBe(true);
    expect(isProtectedInternalPath("/admin")).toBe(true);
  });

  it("returns false for non-protected routes", () => {
    expect(isProtectedInternalPath("/auth/sign-in")).toBe(false);
    expect(isProtectedInternalPath("/external/foo")).toBe(false);
    expect(isProtectedInternalPath("/")).toBe(false);
  });
});

describe("isExternalPath", () => {
  it("detects external routes", () => {
    expect(isExternalPath("/portal")).toBe(true);
    expect(isExternalPath("/external/foo")).toBe(true);
  });

  it("returns false for internal routes", () => {
    expect(isExternalPath("/dashboard")).toBe(false);
    expect(isExternalPath("/admin")).toBe(false);
  });
});

describe("withLocalePath", () => {
  it("prefixes path with locale", () => {
    expect(withLocalePath("/dashboard", "en")).toBe("/en/dashboard");
    expect(withLocalePath("/settings", "de")).toBe("/de/settings");
  });

  it("handles root path without double slash", () => {
    expect(withLocalePath("/", "en")).toBe("/en");
  });
});
