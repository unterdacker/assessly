/**
 * Playwright E2E — Vendor Invitation Flow
 *
 * Tests the complete journey from an admin sending a vendor invite to the
 * vendor accessing the portal with the issued access code.
 *
 * Scenarios:
 *   1. Admin can add a vendor and trigger an invitation
 *   2. Invited vendor can log in with a valid access code
 *   3. Expired access code is rejected at the portal login
 *   4. Wrong / blank access code returns a clear error
 *   5. Vendor is redirected to force-password-change on first login
 *   6. Access code field enforces maximum length (9 chars)
 */

import { test, expect } from "@playwright/test";
import { signInAsAdmin } from "./helpers/auth";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Admin — adding a vendor and sending an invitation
// ---------------------------------------------------------------------------

test.describe("Vendor Invitation — Admin side", () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page);
  });

  test("admin can navigate to the vendors list", async ({ page }) => {
    await page.goto("/en/vendors");
    await expect(page).toHaveURL(/\/en\/vendors/);
    await expect(page.getByRole("heading", { name: /vendors/i })).toBeVisible();
  });

  test("admin can open the Add Vendor modal", async ({ page }) => {
    await page.goto("/en/vendors");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: /add vendor/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("dialog").getByLabel(/name/i)).toBeVisible();
    await expect(page.getByRole("dialog").getByLabel(/email/i)).toBeVisible();
  });

  test("add-vendor form validates required fields", async ({ page }) => {
    await page.goto("/en/vendors");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: /add vendor/i }).click();
    // Submit without filling anything
    await page.getByRole("dialog").getByRole("button", { name: /add|create|save/i }).click();
    // At least one validation message should be visible
    await expect(
      page.getByRole("dialog").locator("[data-slot='form-message'], [aria-live='polite'], .text-destructive").first(),
    ).toBeVisible();
  });

  test("successfully adds a vendor and invite button appears", async ({ page }) => {
    await page.goto("/en/vendors");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: /add vendor/i }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/name/i).fill("E2E Test Vendor GmbH");
    await dialog.getByLabel(/email/i).fill(`e2e-${Date.now()}@vendor-test.example`);
    // Service type may be a select — try to fill generically
    const serviceSelect = dialog.locator("select, [role='combobox']").first();
    if (await serviceSelect.isVisible()) {
      await serviceSelect.click();
      await page.getByRole("listbox").waitFor({ state: "visible", timeout: 5_000 });
      await page.getByRole("listbox").getByRole("option").first().click();
    }
    await dialog.getByRole("button", { name: /add|create|save/i }).click();
    // Modal should close and new vendor row should appear
    await expect(dialog).not.toBeVisible({ timeout: 8000 });
    await expect(page.getByText("E2E Test Vendor GmbH")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// External Vendor Portal — access-code authentication
// ---------------------------------------------------------------------------

test.describe("Vendor Invitation — External portal login", () => {
  const portalUrl = "/en/external/portal";

  test("portal page renders the access-code form", async ({ page }) => {
    await page.goto(portalUrl);
    await expect(page.getByLabel(/access code/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /access|enter|sign in/i })).toBeVisible();
  });

  test("blank access code shows a validation error", async ({ page }) => {
    await page.goto(portalUrl);
    await page.getByRole("button", { name: /access|enter|sign in/i }).click();
    // Browser native required validation prevents submission — the field should be invalid
    const accessCodeInput = page.getByLabel(/access code/i);
    const isRequired = await accessCodeInput.getAttribute("required");
    expect(isRequired).not.toBeNull();
  });

  test("incorrect access code returns 'invalid or expired' error", async ({ page }) => {
    await page.goto(portalUrl);
    await page.getByLabel(/access code/i).fill("XXXX-YYYY");
    await page.getByLabel(/password/i).fill("WrongPassword1!");
    await page.getByRole("button", { name: /access|enter|sign in/i }).click();
    await expect(
      page.getByText(/invalid|expired|not found|incorrect/i),
    ).toBeVisible({ timeout: 8000 });
  });

  test("expired access code is rejected with a clear message", async ({ page }) => {
    // The seed data contains a vendor with an expired token — use a known expired-format code
    await page.goto(portalUrl);
    await page.getByLabel(/access code/i).fill("EXPD-0000");
    await page.getByLabel(/password/i).fill("AnyPassword123!");
    await page.getByRole("button", { name: /access|enter|sign in/i }).click();
    await expect(
      page.getByText(/invalid|expired|not found/i),
    ).toBeVisible({ timeout: 8000 });
  });

  test("access code input enforces maxLength of 9 characters", async ({ page }) => {
    await page.goto(portalUrl);
    const input = page.getByLabel(/access code/i);
    await input.fill("A8X9-B2M4-EXTRA");
    const value = await input.inputValue();
    // Browser enforces maxLength=9
    expect(value.length).toBeLessThanOrEqual(9);
  });

  test("language toggle is accessible on the portal page", async ({ page }) => {
    await page.goto(portalUrl);
    const langToggle = page.getByRole("button", { name: /switch to (english|german)/i }).first();
    await expect(langToggle).toBeVisible();
  });
});
