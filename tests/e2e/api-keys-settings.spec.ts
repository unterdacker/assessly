import { expect, test } from "@playwright/test";
import { signInAsAdmin } from "./helpers/auth";

test.describe("API key settings entry", () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page);
  });

  test("shows API Keys card on settings page and links to api-keys route", async ({ page }) => {
    await page.goto("/en/settings");
    await page.getByRole("tab", { name: /integrations/i }).click();

    const card = page.getByRole("link", { name: /api keys/i }).first();
    await expect(card).toBeVisible({ timeout: 10_000 });

    await card.click();
    await expect(page).toHaveURL(/\/en\/settings\/api-keys/);
  });
});
