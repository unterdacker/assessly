import { expect, test } from "@playwright/test";
import { signInAsAdmin, signInAsAuditor } from "./helpers/auth";

test.describe("Dashboard view mode", () => {
  test("admin lands on executive summary and can switch to full dashboard", async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto("/en/dashboard");

    await expect(page.getByText(/executive summary/i)).toBeVisible();

    await page.getByRole("button", { name: /view full dashboard/i }).click();

    await expect(page.getByRole("heading", { name: /dashboard/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /back to summary/i })).toBeVisible();
  });

  test("auditor lands on full dashboard and can switch to executive summary", async ({ page }) => {
    await signInAsAuditor(page);
    await page.goto("/en/dashboard");

    await expect(page.getByRole("heading", { name: /dashboard/i })).toBeVisible();
    await expect(page.getByText(/executive summary/i)).not.toBeVisible();

    await page.getByRole("button", { name: /back to summary/i }).click();

    await expect(page.getByText(/executive summary/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /view full dashboard/i })).toBeVisible();
  });
});
