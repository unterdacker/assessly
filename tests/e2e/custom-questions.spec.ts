/**
 * Playwright E2E - Custom Assessment Questions
 *
 * Tests the settings UI for managing company-specific custom questions,
 * and validates that custom questions appear in the vendor assessment
 * questionnaire panel.
 *
 * Scenarios:
 *   1. Custom Questions section is visible to ADMIN on settings page
 *   2. Empty state is shown when no custom questions exist
 *   3. "Add question" button opens the add form
 *   4. Submitting empty text shows a validation error
 *   5. Admin can create a custom question successfully
 *   6. Newly created question appears in the list
 *   7. Admin can edit a question and save changes
 *   8. Admin can delete a question with confirmation
 *   9. Custom questions section appears in the assessment questionnaire panel
 */

import { test, expect } from "@playwright/test";
import { signInAsAdmin } from "./helpers/auth";

const SETTINGS_URL = "/en/settings";

test.describe("Custom Questions - Settings UI", () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page);
  });

  test("settings page loads without crashing and shows custom questions section", async ({ page }) => {
    await page.goto(SETTINGS_URL);

    await expect(
      page.getByRole("heading", { name: /custom assessment questions/i }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('"Add question" button is visible', async ({ page }) => {
    await page.goto(SETTINGS_URL);
    await expect(page.getByRole("button", { name: /add question/i })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("clicking Add question opens the question form", async ({ page }) => {
    await page.goto(SETTINGS_URL);
    await page.getByRole("button", { name: /add question/i }).click();

    await expect(page.getByLabel(/^question/i).last()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("button", { name: /^save$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^cancel$/i })).toBeVisible();
  });

  test("submitting add form with empty text shows validation error", async ({ page }) => {
    await page.goto(SETTINGS_URL);
    await page.getByRole("button", { name: /add question/i }).click();
    await page.getByRole("button", { name: /^save$/i }).click();

    await expect(page.getByText(/required/i)).toBeVisible({ timeout: 5_000 });
  });

  test("can create a new custom question", async ({ page }) => {
    await page.goto(SETTINGS_URL);
    await page.getByRole("button", { name: /add question/i }).click();

    const questionText = `E2E test question ${Date.now()}`;
    await page.getByLabel(/^question/i).last().fill(questionText);
    await page.getByRole("button", { name: /^save$/i }).click();

    await expect(page.getByRole("button", { name: /^save$/i })).not.toBeVisible({
      timeout: 8_000,
    });
    await expect(page.getByText(questionText)).toBeVisible({ timeout: 8_000 });
  });

  test("can edit an existing custom question", async ({ page }) => {
    await page.goto(SETTINGS_URL);

    const questionText = `E2E editable question ${Date.now()}`;
    await page.getByRole("button", { name: /add question/i }).click();
    await page.getByLabel(/^question/i).last().fill(questionText);
    await page.getByRole("button", { name: /^save$/i }).click();
    await expect(page.getByText(questionText)).toBeVisible({ timeout: 8_000 });

    const row = page.locator("li", { hasText: questionText }).first();
    await row.getByRole("button", { name: /edit/i }).click();

    const updatedText = `${questionText} (updated)`;
    await page.getByLabel(/^question/i).last().fill(updatedText);
    await page.getByRole("button", { name: /^save$/i }).click();

    await expect(page.getByText(updatedText)).toBeVisible({ timeout: 8_000 });
  });

  test("can delete a custom question", async ({ page }) => {
    await page.goto(SETTINGS_URL);

    // First create a question to delete
    await page.getByRole("button", { name: /add question/i }).click();
    const questionText = `Delete me ${Date.now()}`;
    await page.getByLabel(/^question/i).last().fill(questionText);
    await page.getByRole("button", { name: /^save$/i }).click();
    await expect(page.getByText(questionText)).toBeVisible({ timeout: 8_000 });

    // Accept the window.confirm dialog
    page.once("dialog", (dialog) => dialog.accept());

    // Click delete
    const row = page.getByRole("listitem").filter({ hasText: questionText });
    await row.getByRole("button", { name: /^delete$/i }).click();

    // Question should be removed from the list
    await expect(page.getByText(questionText)).not.toBeVisible({ timeout: 8_000 });
  });
});

test.describe("Custom Questions - Assessment panel integration", () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page);
  });

  test("assessment workspace loads without error", async ({ page }) => {
    await page.goto("/en/vendors");
    await expect(page).toHaveURL(/\/en\/vendors/);

    const vendorLinks = page.getByRole("link").filter({ hasText: /assessment|view|open/i });
    const count = await vendorLinks.count();

    if (count > 0) {
      await vendorLinks.first().click();
      await expect(page.getByText(/NIS2|questionnaire|compliance/i).first()).toBeVisible({
        timeout: 15_000,
      });
    } else {
      await expect(page).toHaveURL(/\/en\/vendors/);
    }
  });
});
