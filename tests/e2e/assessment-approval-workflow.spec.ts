/**
 * Playwright E2E - Assessment Approval Workflow
 *
 * Tests the approval workflow panel rendering, role-based action visibility,
 * and admin status transitions on the assessment page.
 *
 * Serial transition tests assume the first seeded vendor assessment starts in
 * PENDING state.
 *
 * In the "Transition flow" suite, scenarios 1-6 mutate DB state sequentially.
 */

import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { signInAsAdmin, signInAsAuditor } from "./helpers/auth";

async function navigateToApprovalPanel(page: Page): Promise<void> {
  await page.goto("/en/vendors");

  await page.getByRole("row").nth(1).getByRole("link").first().click();
  await page.waitForURL(/\/en\/vendors\/.+/, { timeout: 15_000 });

  const currentUrl = page.url();
  if (!currentUrl.includes("/assessment")) {
    await page.goto(`${currentUrl}/assessment`);
    await page.waitForURL(/\/en\/vendors\/.+\/assessment/, { timeout: 15_000 });
  }
}

test.describe("Assessment Approval Workflow - Panel structure", () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page);
    await navigateToApprovalPanel(page);
  });

  test("approval workflow panel heading is visible", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /approval workflow/i }),
    ).toBeVisible({ timeout: 8_000 });
  });

  test("current status section is present", async ({ page }) => {
    await expect(page.getByText(/current status/i)).toBeVisible({ timeout: 8_000 });
  });

  test("approval history section is present", async ({ page }) => {
    await expect(page.getByText(/approval history/i)).toBeVisible({ timeout: 8_000 });
  });

  test("free plan shows locked Premium transitions", async ({ page }) => {
    await expect(page.getByText("Premium").first()).toBeVisible({ timeout: 8_000 });
  });
});

test.describe.serial("Assessment Approval Workflow - Transition flow", () => {
  test("assessment starts in PENDING state with Move to Under Review button", async ({
    page,
  }) => {
    await signInAsAdmin(page);
    await navigateToApprovalPanel(page);

    await expect(page.getByText("Pending")).toBeVisible({ timeout: 8_000 });
    await expect(
      page.getByRole("button", { name: /move to under review/i }),
    ).toBeVisible({ timeout: 8_000 });
  });

  test("admin transitions assessment from PENDING to UNDER REVIEW", async ({ page }) => {
    await signInAsAdmin(page);
    await navigateToApprovalPanel(page);

    await page.getByRole("button", { name: /move to under review/i }).click();

    await expect(
      page.getByRole("status").filter({ hasText: /updated successfully/i }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Under Review")).toBeVisible({ timeout: 8_000 });
  });

  test("Reject button opens inline comment section", async ({ page }) => {
    await signInAsAdmin(page);
    await navigateToApprovalPanel(page);

    await page.getByRole("button", { name: /^reject$/i }).click();
    await expect(page.getByLabel(/comment required/i)).toBeVisible({ timeout: 8_000 });
  });

  test("Confirm Rejection is disabled when comment is under 10 characters", async ({ page }) => {
    await signInAsAdmin(page);
    await navigateToApprovalPanel(page);

    await page.getByRole("button", { name: /^reject$/i }).click();
    await page.getByLabel(/comment required/i).fill("Too short");
    await expect(
      page.getByRole("button", { name: /confirm rejection/i }),
    ).toBeDisabled();
  });

  test("admin can reject the assessment with a valid comment", async ({ page }) => {
    await signInAsAdmin(page);
    await navigateToApprovalPanel(page);

    await page.getByRole("button", { name: /^reject$/i }).click();
    await page
      .getByLabel(/comment required/i)
      .fill("Insufficient documentation provided for NIS2 compliance.");
    await page.getByRole("button", { name: /confirm rejection/i }).click();

    await expect(
      page.getByRole("status").filter({ hasText: /updated successfully/i }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Rejected")).toBeVisible({ timeout: 8_000 });
  });

  test("approval history shows the recorded transitions", async ({ page }) => {
    await signInAsAdmin(page);
    await navigateToApprovalPanel(page);

    const transitionItems = page
      .locator("ol li")
      .filter({ hasText: /under review|rejected/i });

    await expect(transitionItems.first()).toBeVisible({ timeout: 8_000 });
    const transitionCount = await transitionItems.count();
    expect(transitionCount).toBeGreaterThanOrEqual(2);
  });
});

test.describe("Assessment Approval Workflow - Auditor view", () => {
  test("auditor can view the panel but has no transition buttons", async ({ page }) => {
    await signInAsAuditor(page);
    await navigateToApprovalPanel(page);

    await expect(
      page.getByRole("heading", { name: /approval workflow/i }),
    ).toBeVisible({ timeout: 8_000 });

    await expect(
      page.getByRole("button", {
        name: /move to under review|submit for review|reject|approve|mark as completed/i,
      }),
    ).not.toBeVisible({ timeout: 3_000 });
  });
});
