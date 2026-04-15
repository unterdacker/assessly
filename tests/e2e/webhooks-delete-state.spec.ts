import { expect, test, type Page } from "@playwright/test";
import { signInAsAdmin } from "./helpers/auth";

const SETTINGS_URL = "/en/settings/webhooks";

async function createWebhook(page: Page, name: string) {
  await page.getByRole("button", { name: /add webhook/i }).click();
  await page.getByLabel(/name/i).fill(name);
  await page.getByLabel(/endpoint url/i).fill(`https://example.com/e2e-webhook/${Date.now()}`);
  await page.locator('input[name="events"]').first().check();
  await page.getByRole("button", { name: /save webhook/i }).click();
  await expect(page.getByText(name)).toBeVisible({ timeout: 10_000 });
}

test.describe("Webhooks delete flow", () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto(SETTINGS_URL);
    await expect(page.getByRole("button", { name: /add webhook/i })).toBeVisible({ timeout: 10_000 });
  });

  test("does not remove the next webhook from stale delete success state", async ({ page }) => {
    const hookA = `E2E Webhook A ${Date.now()}`;
    const hookB = `E2E Webhook B ${Date.now()}`;

    await createWebhook(page, hookA);
    await createWebhook(page, hookB);

    const rowA = page.getByRole("listitem").filter({ hasText: hookA }).first();
    await rowA.getByRole("button", { name: new RegExp(`delete ${hookA}`, "i") }).click();
    await rowA.getByRole("button", { name: new RegExp(`delete ${hookA}`, "i") }).click();

    await expect(page.getByText(hookA)).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(hookB)).toBeVisible({ timeout: 10_000 });

    const rowB = page.getByRole("listitem").filter({ hasText: hookB }).first();
    await rowB.getByRole("button", { name: new RegExp(`delete ${hookB}`, "i") }).click();

    await expect(page.getByText(hookB)).toBeVisible();
    await expect(page.getByText(/delete this webhook\?/i)).toBeVisible();
  });
});
