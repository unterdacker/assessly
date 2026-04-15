import type { Page } from "@playwright/test";
import { signInAsAdmin } from "./auth";

/**
 * Returns a valid API key for use in E2E tests against /api/v1/ endpoints.
 *
 * In CI, set PLAYWRIGHT_TEST_API_KEY to a pre-created masked secret to skip
 * the browser-based key creation flow. PLAYWRIGHT_TEST_API_KEY MUST be stored
 * as a masked/encrypted CI secret — never as a plain environment variable or
 * committed .env file.
 *
 * Locally, this helper signs in as admin, navigates to the API keys settings
 * page, creates a new key with all scopes, reads the raw key from the DOM,
 * then navigates away immediately so no key-page snapshot appears in failure
 * screenshots or traces.
 *
 * IMPORTANT: The seeded admin company must be on the PREMIUM plan. API key
 * creation is gated behind the Premium plan check. If running against a FREE
 * plan seed, set PLAYWRIGHT_TEST_API_KEY instead.
 */
export async function getTestApiKey(page: Page): Promise<string> {
  const envKey = process.env.PLAYWRIGHT_TEST_API_KEY;
  if (envKey) {
    return envKey;
  }

  await signInAsAdmin(page);
  await page.goto("/en/settings/api-keys");

  // Open the create form
  await page.getByRole("button", { name: /create new api key/i }).click();

  // Fill the key name
  await page.locator("#api-key-name").fill(`[E2E-TEST] ${Date.now()}`);

  // Check all scopes using attribute selectors (colon in id requires attribute selector)
  const scopes = [
    "vendors:read",
    "vendors:write",
    "assessments:read",
    "assessments:write",
    "metrics:read",
  ];
  for (const scope of scopes) {
    const checkbox = page.locator(`[id="scope-${scope}"]`);
    if (!(await checkbox.isChecked())) {
      await checkbox.check();
    }
  }

  // Submit the form
  await page.getByRole("button", { name: /create key/i }).click();

  // Wait for the secret banner and read the raw key
  const codeEl = page.locator('[role="alert"] code').first();
  await codeEl.waitFor({ state: "visible", timeout: 15_000 });
  const rawKey = await codeEl.textContent();

  // Navigate away IMMEDIATELY — prevents any subsequent test failure from
  // capturing a screenshot of the API keys page (where the raw key is visible)
  await page.goto("/en/dashboard");

  if (!rawKey || !rawKey.startsWith("vs_live_")) {
    throw new Error(
      "Failed to capture API key from DOM. The key banner may not have appeared, " +
        "or the admin company is not on the PREMIUM plan. " +
        "Set PLAYWRIGHT_TEST_API_KEY env var to bypass UI key creation.",
    );
  }

  return rawKey.trim();
}
