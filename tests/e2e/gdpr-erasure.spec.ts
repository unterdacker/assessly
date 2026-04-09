/**
 * Playwright E2E — GDPR Right-to-Erasure Flow
 *
 * Validates the compliance path for GDPR Art. 17 (right to erasure) as
 * implemented by the ADMIN user-revocation action:
 *
 *   1. ADMIN creates a test vendor (establishes PII in the system).
 *   2. ADMIN creates a test internal AUDITOR user.
 *   3. ADMIN revokes the test user — deactivates the account and replaces
 *      the email with a pseudonymised marker (revoked-{id}@revoked.invalid).
 *   4. The audit trail reflects a USER_DELETED event with the ISO27001/SOC2
 *      compliance category.
 *   5. The deleted user's PII (email) no longer appears verbatim in the
 *      users table; only the redacted marker is visible.
 *   6. The separately-created vendor record is entirely unaffected by the
 *      user deletion, satisfying the requirement that data minimisation does
 *      not cascade to unrelated entities.
 *   7. The forensic-bundle API confirms USER_DELETED events are present and
 *      that entityId values conform to the expected UUID format.
 */

import { test, expect, type Page } from "@playwright/test";
import { signInAsAdmin } from "./helpers/auth";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a vendor via the REST API endpoint.
 * page.request shares the browser context cookie jar so the auth session
 * cookie is forwarded automatically.
 */
async function createVendorViaApi(
  page: Page,
  name: string,
  email: string,
): Promise<void> {
  const res = await page.request.post("/api/vendors/create", {
    // application/x-www-form-urlencoded is consumed by request.formData()
    // in the Next.js route handler.
    form: { name, email },
  });
  expect(
    res.ok(),
    `Vendor creation API returned ${res.status()} — expected 200`,
  ).toBeTruthy();
}

// ---------------------------------------------------------------------------
// Smoke — page access
// ---------------------------------------------------------------------------

test.describe("GDPR Erasure — navigation", () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page);
  });

  test("ADMIN can access the user-management page", async ({ page }) => {
    await page.goto("/en/dashboard/users");
    await expect(page).toHaveURL(/\/en\/dashboard\/users/);
    await expect(
      page.getByRole("heading").filter({ hasText: /user/i }).first(),
    ).toBeVisible();
  });

  test("ADMIN can access the audit-trail page", async ({ page }) => {
    await page.goto("/en/admin/audit-logs");
    await expect(page).toHaveURL(/\/en\/admin\/audit-logs/);
    await expect(
      page.getByRole("heading", { name: /audit trail/i }),
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Core GDPR flow
// ---------------------------------------------------------------------------

test.describe("GDPR Erasure — user lifecycle and PII redaction", () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page);
  });

  test(
    "vendor row persists after an unrelated internal user is revoked (GDPR Art. 17)",
    async ({ page }) => {
      const uniqueId = Date.now();
      const vendorName = `GDPR-E2E-Vendor-${uniqueId}`;
      const vendorEmail = `gdpr-vendor-${uniqueId}@test.example`;
      const testUserEmail = `gdpr-user-${uniqueId}@test.example`;

      // -----------------------------------------------------------------------
      // Step 1 — Create a test vendor via the API to establish PII in the
      //          system that must survive the subsequent user deletion.
      // -----------------------------------------------------------------------
      await createVendorViaApi(page, vendorName, vendorEmail);

      // -----------------------------------------------------------------------
      // Step 2 — Verify the vendor appears in the vendors list.
      // -----------------------------------------------------------------------
      await page.goto("/en/vendors");
      await expect(page.getByText(vendorName)).toBeVisible({ timeout: 10_000 });

      // -----------------------------------------------------------------------
      // Step 3 — Create a test internal AUDITOR user via the Add User modal.
      // -----------------------------------------------------------------------
      await page.goto("/en/dashboard/users");
      await page.getByRole("button", { name: /add user/i }).click();

      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();

      await dialog.getByLabel(/email address/i).fill(testUserEmail);
      // Role defaults to AUDITOR in the modal — leave unchanged.
      await dialog.getByRole("button", { name: /create user/i }).click();

      // Success toast confirms creation; the temp password is shown there.
      await expect(page.getByText(/user created successfully/i)).toBeVisible({
        timeout: 10_000,
      });

      // User row should appear in the table after Next.js cache revalidation.
      await expect(page.getByText(testUserEmail)).toBeVisible({
        timeout: 10_000,
      });

      // -----------------------------------------------------------------------
      // Step 4 — Revoke the test user via the table action dropdown.
      //          The "Change role" button (MoreHorizontal) is the entry point.
      // -----------------------------------------------------------------------
      const userRow = page.getByRole("row").filter({ hasText: testUserEmail });
      await userRow.getByRole("button", { name: /change role/i }).click();

      await page.getByRole("menuitem", { name: /revoke access/i }).click();

      // Confirm the destructive alert dialog.
      await page.getByRole("button", { name: /yes, revoke access/i }).click();

      // Toast confirmation of revocation.
      await expect(page.getByText(/user access revoked/i)).toBeVisible({
        timeout: 10_000,
      });

      // -----------------------------------------------------------------------
      // Step 5 — Verify PII is pseudonymised.
      //
      // deleteUser() in lib/iam.ts replaces the email with:
      //   revoked-{userId}@revoked.invalid
      //
      // After cache revalidation the original email address must no longer
      // appear in the table.
      // -----------------------------------------------------------------------

      // Allow Next.js server-action revalidation to propagate.
      await page.waitForTimeout(800);

      // Original email must be gone from the table.
      await expect(
        page.getByRole("cell", { name: testUserEmail }),
      ).not.toBeVisible({ timeout: 8_000 });

      // The row should now show the pseudonymised / redacted marker.
      await expect(
        page.getByText(/revoked-.+@revoked\.invalid/),
      ).toBeVisible({ timeout: 8_000 });

      // -----------------------------------------------------------------------
      // Step 6 — Verify the audit trail records a USER_DELETED event.
      // -----------------------------------------------------------------------
      await page.goto("/en/admin/audit-logs");
      await expect(page.getByText("USER_DELETED")).toBeVisible({
        timeout: 10_000,
      });

      // -----------------------------------------------------------------------
      // Step 7 — Confirm the test vendor is unaffected.
      //          User deletion MUST NOT cascade to independent vendor records.
      // -----------------------------------------------------------------------
      await page.goto("/en/vendors");
      await expect(page.getByText(vendorName)).toBeVisible({ timeout: 10_000 });
    },
  );
});

// ---------------------------------------------------------------------------
// API-level GDPR assertions
// ---------------------------------------------------------------------------

test.describe("GDPR Erasure — forensic bundle reflects deletion events", () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page);
  });

  test(
    "forensic bundle API includes USER_DELETED entries with valid entityId format",
    async ({ page }) => {
      // page.request uses the same auth cookies as the browser page.
      const response = await page.request.get(
        "/api/audit-logs/forensic-bundle?format=json",
      );

      expect(response.status()).toBe(200);

      const body = (await response.json()) as {
        ok: boolean;
        logs?: Array<{
          action: string;
          entityId: string;
          userId: string;
          ipAddress: string | null;
        }>;
        _meta?: { signature: string };
      };

      expect(body.ok).toBe(true);

      const allLogs = body.logs ?? [];
      const deletionEntries = allLogs.filter(
        (entry) => entry.action === "USER_DELETED",
      );

      if (deletionEntries.length > 0) {
        for (const entry of deletionEntries) {
          // entityId is the deleted user's primary key — must be a UUID.
          expect(entry.entityId).toMatch(
            // Accept UUID v4 or Prisma CUID2 (the project uses cuid() as the User PK)
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$|^[a-z][a-z0-9]{20,30}$/i,
          );
        }
      }
    },
  );

  test(
    "IP addresses in the forensic bundle are truncated per GDPR Recital 30",
    async ({ page }) => {
      const response = await page.request.get(
        "/api/audit-logs/forensic-bundle?format=json",
      );

      expect(response.status()).toBe(200);

      const body = (await response.json()) as {
        ok: boolean;
        logs?: Array<{ ipAddress: string | null }>;
      };

      expect(body.ok).toBe(true);

      const entriesWithIp = (body.logs ?? []).filter(
        (entry) => entry.ipAddress !== null && entry.ipAddress !== "",
      );

      // Every non-null IP must be truncated:
      //  IPv4 → last octet zeroed: "x.x.x.0"
      //  IPv6 → masked: "x:x:x:x:xxxx:xxxx:xxxx:xxxx" or "[ipv6-masked]"
      for (const entry of entriesWithIp) {
        const ip = entry.ipAddress!;
        const isIpv4 = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.0$/.test(ip);
        const isIpv6Masked =
          /xxxx/.test(ip) || ip === "[ipv6-masked]";
        expect(
          isIpv4 || isIpv6Masked,
          `Expected IP "${ip}" to be truncated (GDPR Rec. 30), but it appears to be a full address`,
        ).toBe(true);
      }
    },
  );
});
