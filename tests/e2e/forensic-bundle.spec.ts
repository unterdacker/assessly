/**
 * Playwright E2E — Forensic Bundle Export
 *
 * Validates the cryptographically-signed forensic audit bundle endpoint
 * (GET /api/audit-logs/forensic-bundle) for both JSON and CSV formats.
 *
 * Scenarios:
 *   1.  JSON export — HTTP 200 and correct Content-Type header.
 *   2.  JSON export — Content-Disposition filename contains a current
 *       Unix-epoch timestamp (avra-forensic-bundle-{ts}.json).
 *   3.  JSON export — response body contains the top-level _meta.signature
 *       field (HMAC-SHA256 bundle integrity check, NIS2/DORA Art. 9).
 *   4.  JSON export — response body structure: ok, generatedAt, profile,
 *       chainIntegrity, logs array, and _meta sub-object.
 *   5.  JSON export — IP addresses in logs are truncated per GDPR Rec. 30
 *       (last IPv4 octet zeroed; IPv6 masked).
 *   6.  CSV export — HTTP 200 and Content-Type: text/csv.
 *   7.  CSV export — Content-Disposition filename contains a current
 *       Unix-epoch timestamp (avra-forensic-bundle-{ts}.csv).
 *   8.  CSV export — PII fields (ipAddress column) contain truncated values
 *       rather than full IP addresses.
 *   9.  Unauthenticated requests are rejected with HTTP 403.
 *   10. Audit Logs UI — "Download Forensic Bundle" button is visible to ADMIN.
 *
 * Framework references:
 *   NIS2 Art. 21, DORA Art. 9, EU AI Act Art. 12/14,
 *   ISO 27001 A.12.4, SOC2 CC7.2, GDPR Art. 5/25, GDPR Recital 30
 */

import { test, expect, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sign in as the seeded ADMIN user and wait for the dashboard redirect. */
async function signInAsAdmin(page: Page): Promise<void> {
  await page.goto("/en/auth/sign-in");
  await page.getByLabel(/email/i).fill("admin@demo.avra.dev");
  await page.getByLabel(/password/i).fill("Admin1234!");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/en\/dashboard/);
}

/**
 * Returns the Unix-epoch timestamp embedded in an
 * "avra-forensic-bundle-{timestamp}.{ext}" Content-Disposition filename,
 * or null if the header is missing or does not match the expected pattern.
 */
function extractTimestampFromDisposition(
  disposition: string | null,
): number | null {
  if (!disposition) return null;
  const match = disposition.match(/avra-forensic-bundle-(\d+)\.(json|csv)/);
  if (!match) return null;
  return parseInt(match[1], 10);
}

// ---------------------------------------------------------------------------
// JSON format
// ---------------------------------------------------------------------------

test.describe("Forensic Bundle — JSON format", () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page);
  });

  test("GET ?format=json returns HTTP 200 with application/json Content-Type", async ({
    page,
  }) => {
    const response = await page.request.get(
      "/api/audit-logs/forensic-bundle?format=json",
    );

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/json");
  });

  test("JSON Content-Disposition filename embeds a current Unix-epoch timestamp", async ({
    page,
  }) => {
    const before = Date.now();

    const response = await page.request.get(
      "/api/audit-logs/forensic-bundle?format=json",
    );

    const after = Date.now();

    expect(response.status()).toBe(200);

    const disposition = response.headers()["content-disposition"] ?? null;
    expect(
      disposition,
      "Content-Disposition header must be present",
    ).not.toBeNull();

    const ts = extractTimestampFromDisposition(disposition);
    expect(
      ts,
      `Content-Disposition "${disposition}" does not contain the expected avra-forensic-bundle-{timestamp}.json pattern`,
    ).not.toBeNull();

    // Timestamp must fall within the test window (+/- a few seconds for CI
    // overhead). Using a 60-second window to be CI-friendly.
    expect(ts!).toBeGreaterThanOrEqual(before - 60_000);
    expect(ts!).toBeLessThanOrEqual(after + 60_000);
  });

  test("JSON body contains _meta.signature (HMAC-SHA256 bundle integrity)", async ({
    page,
  }) => {
    const response = await page.request.get(
      "/api/audit-logs/forensic-bundle?format=json",
    );

    expect(response.status()).toBe(200);

    const body = (await response.json()) as {
      ok?: boolean;
      _meta?: {
        signature?: string;
        signatureAlgorithm?: string;
        format?: string;
        frameworks?: string[];
      };
    };

    expect(body.ok).toBe(true);
    expect(body._meta).toBeDefined();
    expect(body._meta!.signature).toBeDefined();

    // HMAC-SHA256 digest is a 64-character lowercase hex string.
    expect(body._meta!.signature).toMatch(/^[0-9a-f]{64}$/);

    // Confirm the declared algorithm matches what the route implements.
    expect(body._meta!.signatureAlgorithm).toBe("HMAC-SHA256");
  });

  test("JSON body has the expected top-level structure", async ({ page }) => {
    const response = await page.request.get(
      "/api/audit-logs/forensic-bundle?format=json",
    );

    expect(response.status()).toBe(200);

    const body = (await response.json()) as Record<string, unknown>;

    // Required fields per the forensic-bundle v2 specification.
    expect(typeof body.ok).toBe("boolean");
    expect(typeof body.generatedAt).toBe("string");
    expect(typeof body.companyId).toBe("string");
    expect(typeof body.totalEvents).toBe("number");
    expect(typeof body.profile).toBe("string");
    expect(body.profile).toBe("ADMIN"); // signed in as ADMIN

    expect(body.chainIntegrity).toBeDefined();
    expect(Array.isArray(body.logs)).toBe(true);
    expect(body._meta).toBeDefined();

    // generatedAt must be a valid ISO-8601 date string.
    const generated = new Date(body.generatedAt as string);
    expect(Number.isNaN(generated.getTime())).toBe(false);

    // The date must be recent (within the last 60 seconds).
    expect(Date.now() - generated.getTime()).toBeLessThan(60_000);
  });

  test("IP addresses in the JSON logs are truncated per GDPR Recital 30", async ({
    page,
  }) => {
    const response = await page.request.get(
      "/api/audit-logs/forensic-bundle?format=json",
    );

    expect(response.status()).toBe(200);

    const body = (await response.json()) as {
      logs?: Array<{ ipAddress: string | null }>;
    };

    const entriesWithIp = (body.logs ?? []).filter(
      (entry) => entry.ipAddress !== null && entry.ipAddress !== "",
    );

    // Every non-null IP must be pseudonymised / truncated.
    for (const entry of entriesWithIp) {
      const ip = entry.ipAddress!;

      // IPv4 truncation: last octet zeroed → "a.b.c.0"
      const isIpv4Truncated = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.0$/.test(ip);

      // IPv6 masking: last 4 groups replaced with "xxxx"
      const isIpv6Masked = /xxxx/.test(ip) || ip === "[ipv6-masked]";

      expect(
        isIpv4Truncated || isIpv6Masked,
        `IP address "${ip}" in forensic bundle is a full/untruncated address — GDPR Rec. 30 requires truncation`,
      ).toBe(true);
    }
  });

  test("response includes Cache-Control: no-store header", async ({ page }) => {
    const response = await page.request.get(
      "/api/audit-logs/forensic-bundle?format=json",
    );

    expect(response.status()).toBe(200);

    const cacheControl = response.headers()["cache-control"] ?? "";
    expect(cacheControl).toContain("no-store");
  });
});

// ---------------------------------------------------------------------------
// CSV format
// ---------------------------------------------------------------------------

test.describe("Forensic Bundle — CSV format", () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page);
  });

  test("GET ?format=csv returns HTTP 200 with text/csv Content-Type", async ({
    page,
  }) => {
    const response = await page.request.get(
      "/api/audit-logs/forensic-bundle?format=csv",
    );

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/csv");
  });

  test("CSV Content-Disposition filename embeds a current Unix-epoch timestamp", async ({
    page,
  }) => {
    const before = Date.now();

    const response = await page.request.get(
      "/api/audit-logs/forensic-bundle?format=csv",
    );

    const after = Date.now();

    expect(response.status()).toBe(200);

    const disposition = response.headers()["content-disposition"] ?? null;
    expect(
      disposition,
      "Content-Disposition header must be present",
    ).not.toBeNull();

    const ts = extractTimestampFromDisposition(disposition);
    expect(
      ts,
      `Content-Disposition "${disposition}" does not contain the expected avra-forensic-bundle-{timestamp}.csv pattern`,
    ).not.toBeNull();

    expect(ts!).toBeGreaterThanOrEqual(before - 60_000);
    expect(ts!).toBeLessThanOrEqual(after + 60_000);
  });

  test("CSV response does not expose full IPv4 addresses (GDPR Rec. 30)", async ({
    page,
  }) => {
    const response = await page.request.get(
      "/api/audit-logs/forensic-bundle?format=csv",
    );

    expect(response.status()).toBe(200);

    const csvText = await response.text();

    // Strategy: any cell that looks like a full IPv4 address with a non-zero
    // last octet must NOT appear in the export.
    //
    // Pattern matches "1.2.3.4" where the last segment is 1–255.
    // Last-octet-zero addresses ("1.2.3.0") are the allowed truncated form.
    const fullIpPattern = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.(?!0\b)[1-9]\d*\b/;

    expect(
      fullIpPattern.test(csvText),
      "CSV export contains at least one full (non-truncated) IPv4 address — " +
        "GDPR Recital 30 requires the last octet to be zeroed",
    ).toBe(false);
  });

  test("CSV response includes Cache-Control: no-store header", async ({
    page,
  }) => {
    const response = await page.request.get(
      "/api/audit-logs/forensic-bundle?format=csv",
    );

    expect(response.status()).toBe(200);

    const cacheControl = response.headers()["cache-control"] ?? "";
    expect(cacheControl).toContain("no-store");
  });

  test("CSV headers row contains expected audit log columns", async ({
    page,
  }) => {
    const response = await page.request.get(
      "/api/audit-logs/forensic-bundle?format=csv",
    );

    expect(response.status()).toBe(200);

    const csvText = await response.text();
    const lines = csvText.trim().split("\n");

    // Skip any preamble comment lines (# prefix).
    const headerLine = lines.find((l) => !l.startsWith("#")) ?? "";
    const columns = headerLine.split(",").map((c) => c.trim().replace(/"/g, ""));

    // Core audit identity columns must always be present.
    expect(columns).toContain("id");
    expect(columns).toContain("timestamp");
    expect(columns).toContain("action");
    expect(columns).toContain("entityType");
    expect(columns).toContain("entityId");
  });
});

// ---------------------------------------------------------------------------
// Authentication / authorisation — negative cases
// ---------------------------------------------------------------------------

test.describe("Forensic Bundle — access control", () => {
  test("unauthenticated GET ?format=json returns HTTP 403", async ({
    page,
  }) => {
    // Deliberately NOT signing in — request is made without auth cookies.
    const response = await page.request.get(
      "/api/audit-logs/forensic-bundle?format=json",
    );

    expect(response.status()).toBe(403);

    const body = (await response.json()) as { ok?: boolean; error?: string };
    expect(body.ok).toBe(false);
  });

  test("unauthenticated GET ?format=csv returns HTTP 403", async ({ page }) => {
    const response = await page.request.get(
      "/api/audit-logs/forensic-bundle?format=csv",
    );

    expect(response.status()).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Chain-integrity verify mode
// ---------------------------------------------------------------------------

test.describe("Forensic Bundle — chain integrity verify", () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page);
  });

  test("?mode=verify returns chainIntegrity object with required fields", async ({
    page,
  }) => {
    const response = await page.request.get(
      "/api/audit-logs/forensic-bundle?mode=verify",
    );

    expect(response.status()).toBe(200);

    const body = (await response.json()) as {
      ok?: boolean;
      companyId?: string;
      generatedAt?: string;
      chainIntegrity?: {
        totalEvents?: number;
        eventsWithChain?: number;
        verifiedChain?: number;
        genesisEvents?: number;
        integrityRate?: number | null;
        verified?: boolean;
        brokenAt?: string | null;
      };
    };

    expect(body.ok).toBe(true);
    expect(body.chainIntegrity).toBeDefined();

    const ci = body.chainIntegrity!;
    expect(typeof ci.totalEvents).toBe("number");
    expect(typeof ci.eventsWithChain).toBe("number");
    expect(typeof ci.verifiedChain).toBe("number");
    expect(typeof ci.genesisEvents).toBe("number");
    expect(typeof ci.verified).toBe("boolean");
  });
});

// ---------------------------------------------------------------------------
// UI — Download Forensic Bundle button visibility
// ---------------------------------------------------------------------------

test.describe("Forensic Bundle — Audit Logs UI", () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page);
  });

  test("audit logs page renders the Download Forensic Bundle button for ADMIN", async ({
    page,
  }) => {
    await page.goto("/en/admin/audit-logs");

    // The AuditLogsTable renders a "Download Forensic Bundle" button.
    await expect(
      page.getByRole("button", { name: /download forensic bundle/i }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("audit logs page renders the Export CSV (Admin) button for ADMIN", async ({
    page,
  }) => {
    await page.goto("/en/admin/audit-logs");

    await expect(
      page.getByRole("button", { name: /export csv/i }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("audit logs page renders the Verify Integrity button for ADMIN", async ({
    page,
  }) => {
    await page.goto("/en/admin/audit-logs");

    await expect(
      page.getByRole("button", { name: /verify integrity/i }),
    ).toBeVisible({ timeout: 10_000 });
  });
});
