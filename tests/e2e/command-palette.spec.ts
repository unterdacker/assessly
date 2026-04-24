import { expect, test } from "@playwright/test";
import { signInAsAdmin } from "./helpers/auth";

test.describe("Command Palette", () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page);
  });

  test("opens with Ctrl/Cmd+K and closes with Escape", async ({ page }) => {
    await page.goto("/en/dashboard");

    await page.keyboard.press("ControlOrMeta+K");
    await expect(page.getByPlaceholder(/search vendors, navigate/i)).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByPlaceholder(/search vendors, navigate/i)).not.toBeVisible();
  });

  test("navigates to vendors via keyboard selection", async ({ page }) => {
    await page.goto("/en/dashboard");

    await page.keyboard.press("ControlOrMeta+K");
    const input = page.getByPlaceholder(/search vendors, navigate/i);
    await expect(input).toBeVisible();

    await input.fill("vendors");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/\/en\/vendors/);
  });
});
