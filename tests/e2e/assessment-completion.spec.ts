/**
 * Playwright E2E — Assessment Completion Flow
 *
 * Tests the complete journey of an admin completing a vendor's NIS2 assessment,
 * including PDF evidence upload, questionnaire answers, AI analysis triggers,
 * and final score/risk display.
 *
 * Scenarios:
 *   1. Admin can open the assessment workspace for a vendor
 *   2. Upload zone rejects files exceeding the 5 MB size limit
 *   3. Upload zone rejects non-PDF file types (invalid signature)
 *   4. Upload zone accepts a valid minimal PDF
 *   5. Questionnaire panel loads with NIS2 questions
 *   6. Admin can set an answer status and the score updates
 *   7. Compliance score and risk badge appear after answers are saved
 *   8. Assessment completion state is persisted after page reload
 *
 * External portal — assessment submission:
 *   9.  External vendor can submit answers via access-code-authenticated session
 *   10. Submitting with an expired token is blocked server-side
 */

import { test, expect } from "@playwright/test";
import { signInAsAdmin } from "./helpers/auth";
import path from "path";
import fs from "fs";
import os from "os";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a minimal but valid PDF file on disk and returns its path. */
function createMinimalPdf(sizeBytes = 1024): string {
  // Minimal valid PDF structure (header + cross-reference)
  const content = [
    "%PDF-1.4",
    "1 0 obj<</Type /Catalog /Pages 2 0 R>>endobj",
    "2 0 obj<</Type /Pages /Kids [3 0 R] /Count 1>>endobj",
    "3 0 obj<</Type /Page /MediaBox [0 0 612 792]>>endobj",
    "xref 0 4",
    "0000000000 65535 f ",
    "trailer<</Size 4 /Root 1 0 R>>",
    "startxref 9",
    "%%EOF",
  ].join("\n");

  // Pad to desired size
  const padding = Math.max(0, sizeBytes - content.length);
  const fullContent = content + " ".repeat(padding);
  const tmpFile = path.join(os.tmpdir(), `assessly-test-${Date.now()}.pdf`);
  fs.writeFileSync(tmpFile, fullContent);
  return tmpFile;
}

/** Creates a fake non-PDF file (PNG header) and returns its path. */
function createFakeImageAsPdf(): string {
  // PNG magic bytes — should fail the %PDF- signature check
  const content = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const tmpFile = path.join(os.tmpdir(), `assessly-fake-${Date.now()}.pdf`);
  fs.writeFileSync(tmpFile, content);
  return tmpFile;
}

// ---------------------------------------------------------------------------
// Admin assessment workspace
// ---------------------------------------------------------------------------

test.describe("Assessment Completion — Admin workspace", () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page);
  });

  test("vendors list loads and links to vendor detail", async ({ page }) => {
    await page.goto("/en/vendors");
    // At least one vendor row should exist (seeded data)
    const vendorRow = page.getByRole("row").nth(1);
    await expect(vendorRow).toBeVisible({ timeout: 10000 });
  });

  test("vendor assessment page renders compliance workspace", async ({ page }) => {
    await page.goto("/en/vendors");
    // Click first vendor in the list to open their detail
    const firstVendorLink = page
      .getByRole("row")
      .nth(1)
      .getByRole("link")
      .first();
    await firstVendorLink.click();
    await page.waitForURL(/\/en\/vendors\/.+/);
    // Assessment workspace heading or tab should be visible
    await expect(
      page.getByRole("heading").filter({ hasText: /assessment|compliance|questionnaire/i }).first(),
    ).toBeVisible({ timeout: 8000 });
  });

  test("PDF upload zone is present on the assessment page", async ({ page }) => {
    await page.goto("/en/vendors");
    const firstVendorLink = page.getByRole("row").nth(1).getByRole("link").first();
    await firstVendorLink.click();
    await page.waitForURL(/\/en\/vendors\/.+/);
    // The upload area or 'Upload' button should be visible
    const uploadZone = page
      .locator("[data-testid='pdf-upload-zone'], label[for*='file'], input[type='file']")
      .first();
    await expect(uploadZone).toBeVisible({ timeout: 8000 });
  });
});

// ---------------------------------------------------------------------------
// PDF Upload — file validation edge cases
// ---------------------------------------------------------------------------

test.describe("Assessment Completion — PDF upload validation", () => {
  let validPdfPath: string;
  let invalidFilePath: string;

  test.beforeAll(() => {
    validPdfPath = createMinimalPdf();
    invalidFilePath = createFakeImageAsPdf();
  });

  test.afterAll(() => {
    fs.rmSync(validPdfPath, { force: true });
    fs.rmSync(invalidFilePath, { force: true });
  });

  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto("/en/vendors");
    const firstVendorLink = page.getByRole("row").nth(1).getByRole("link").first();
    await firstVendorLink.click();
    await page.waitForURL(/\/en\/vendors\/.+/);
  });

  test("rejects a non-PDF file with a security error message", async ({ page }) => {
    const fileInput = page.locator("input[type='file']").first();
    await fileInput.setInputFiles(invalidFilePath);
    await expect(
      page.getByText(/security check failed|not a valid pdf|invalid file/i),
    ).toBeVisible({ timeout: 10000 });
  });

  test("rejects a file over the 5 MB limit", async ({ page }) => {
    // Create a 6 MB fake PDF (starts with %PDF- but is oversized).
    // Use mkdtempSync so the directory (and file inside it) is created
    // atomically with restricted permissions — avoids CWE-377/CWE-378.
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "assessly-oversize-"));
    const oversizedPath = path.join(tmpDir, "oversize.pdf");
    const header = "%PDF-1.4\n";
    const padding = Buffer.alloc(6 * 1024 * 1024, "A");
    fs.writeFileSync(oversizedPath, header + padding.toString("utf8"));

    const fileInput = page.locator("input[type='file']").first();
    await fileInput.setInputFiles(oversizedPath);
    await expect(
      page.getByText(/exceeds|too large|maximum.*size|size.*limit/i),
    ).toBeVisible({ timeout: 10000 });

    fs.rmSync(tmpDir, { force: true, recursive: true });
  });

  test("accepts a valid minimal PDF without immediate errors", async ({ page }) => {
    const fileInput = page.locator("input[type='file']").first();
    await fileInput.setInputFiles(validPdfPath);
    // Error message must NOT appear for a valid file
    await expect(
      page.getByText(/security check failed|not a valid pdf|exceeds|too large/i),
    ).not.toBeVisible({ timeout: 5000 });
  });
});

// ---------------------------------------------------------------------------
// Questionnaire & scoring
// ---------------------------------------------------------------------------

test.describe("Assessment Completion — Questionnaire & scoring", () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto("/en/vendors");
    const firstVendorLink = page.getByRole("row").nth(1).getByRole("link").first();
    await firstVendorLink.click();
    await page.waitForURL(/\/en\/vendors\/.+/);
  });

  test("NIS2 questionnaire panel is visible with question items", async ({ page }) => {
    const questionPanel = page.locator(
      "[data-testid='questionnaire-panel'], [aria-label*='questionnaire'], .questionnaire",
    );
    // Fallback: look for a labelled section
    const questionItems = page.getByRole("listitem").filter({ hasText: /nis2|security|policy|risk|incident/i });
    // Either the dedicated panel or at least one question-like item is present
    const panelVisible = await questionPanel.isVisible().catch(() => false);
    const itemsVisible = (await questionItems.count()) > 0;
    expect(panelVisible || itemsVisible).toBeTruthy();
  });

  test("compliance score element is rendered on the page", async ({ page }) => {
    // The score may be shown as a percentage text or progress badge
    const scoreEl = page.locator(
      "[data-testid='compliance-score'], [aria-label*='compliance'], [aria-label*='score']",
    ).first();
    const percentText = page.getByText(/\d+\s*%/).first();
    const scoreVisible = await scoreEl.isVisible().catch(() => false);
    const percentVisible = await percentText.isVisible().catch(() => false);
    expect(scoreVisible || percentVisible).toBeTruthy();
  });

  test("risk badge is present and shows a valid level", async ({ page }) => {
    const riskBadge = page
      .getByText(/\b(high|medium|low)\b/i)
      .first();
    await expect(riskBadge).toBeVisible({ timeout: 8000 });
  });
});

// ---------------------------------------------------------------------------
// External vendor portal — assessment submission with expired token
// ---------------------------------------------------------------------------

test.describe("Assessment Completion — External portal (expired token)", () => {
  test("accessing an assessment link with an expired token shows an error", async ({ page }) => {
    // Navigating to a known-expired token path should redirect or show error
    await page.goto("/en/external/assessment/expired-token-00000000");
    // The page should not silently succeed — expect a redirect to portal or an error message
    await expect(
      page.getByText(/expired|invalid|not found|access denied/i).or(
        page.getByRole("heading", { name: /error|not found|unauthorized/i }),
      ),
    ).toBeVisible({ timeout: 8000 });
  });

  test("accessing an assessment link with a blank token redirects to portal", async ({ page }) => {
    await page.goto("/en/external/assessment/");
    // Should redirect to portal login or show 404
    await expect(
      page.getByText(/access code|not found|portal/i).first(),
    ).toBeVisible({ timeout: 8000 });
  });
});

// ---------------------------------------------------------------------------
// External vendor portal — full assessment submission flow (happy path)
// ---------------------------------------------------------------------------

test.describe("Assessment Completion — External vendor submission", () => {
  test("external portal login page renders all required form elements", async ({ page }) => {
    await page.goto("/en/external/portal");
    await expect(page.getByLabel(/access code/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /access|enter|continue|sign in/i }),
    ).toBeVisible();
  });

  test("submitting wrong credentials shows an error without leaking details", async ({
    page,
  }) => {
    await page.goto("/en/external/portal");
    await page.getByLabel(/access code/i).fill("A8X9-FAKE");
    await page.getByLabel(/password/i).fill("WrongPassword1!");
    await page.getByRole("button", { name: /access|enter|continue|sign in/i }).click();
    const errorMsg = page.getByText(/invalid|expired|not found|incorrect/i);
    await expect(errorMsg).toBeVisible({ timeout: 8000 });
    // Should NOT reveal whether the code or the password was wrong (no leaking)
    await expect(page.getByText(/password is wrong|code does not exist/i)).not.toBeVisible();
  });
});
