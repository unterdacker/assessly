import type { Page } from "@playwright/test";

/**
 * Signs in as the seeded admin user and waits for the dashboard URL.
 *
 * Waits for the email label to be attached to the DOM before filling —
 * defensive against slow first-paint on CI runners.
 */
export async function signInAsAdmin(page: Page): Promise<void> {
  await page.goto("/en/auth/sign-in");
  await page.waitForSelector('label[for="email"]', { state: "attached", timeout: 15_000 });
  await page.getByLabel(/email/i).fill(
    process.env.ASSESSLY_ADMIN_EMAIL ?? "admin@demo.assessly.dev",
  );
  await page.getByLabel(/password/i).fill(
    process.env.ASSESSLY_ADMIN_PASSWORD ?? "Admin1234!",
  );
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/en\/dashboard/, { timeout: 30_000 });
}

export async function signInAsAuditor(page: Page): Promise<void> {
  await page.goto("/en/auth/sign-in");
  await page.waitForSelector('label[for="email"]', { state: "attached", timeout: 15_000 });
  await page.getByLabel(/email/i).fill(
    process.env.ASSESSLY_AUDITOR_EMAIL ?? "auditor@assessly.local",
  );
  await page.getByLabel(/password/i).fill(
    process.env.ASSESSLY_AUDITOR_PASSWORD ?? "auditor123",
  );
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/en\/dashboard/, { timeout: 30_000 });
}
