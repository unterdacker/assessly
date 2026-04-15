import { expect, test } from "@playwright/test";
import { getTestApiKey } from "./helpers/api-key";

const NONEXISTENT_ID = "clzzzzzzzzzzzzzzzzzzzzzzz";

let apiKey: string;
let vendorId: string;
let assessmentId: string;

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  apiKey = await getTestApiKey(page);
  await page.close();

  // Create a dedicated test vendor for this spec (self-contained)
  const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
  const createRes = await fetch(`${baseURL}/api/v1/vendors`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: `[E2E-TEST] Assessment Vendor ${Date.now()}`,
      email: `e2e-assessment-vendor-${Date.now()}@example.com`,
      serviceType: "Managed Services",
    }),
  });
  if (!createRes.ok) {
    throw new Error(
      `beforeAll: Failed to create test vendor (status ${createRes.status}). ` +
        "Ensure the admin company is on the PREMIUM plan and the API key is valid.",
    );
  }
  const vendorBody = await createRes.json();
  vendorId = vendorBody.data.id;

  // Create a test assessment for all subsequent tests to share
  const assessRes = await fetch(`${baseURL}/api/v1/assessments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ vendorId, riskLevel: "HIGH", complianceScore: 45, status: "PENDING" }),
  });
  if (!assessRes.ok) {
    throw new Error(
      `beforeAll: Failed to create test assessment (status ${assessRes.status}).`,
    );
  }
  const assessBody = await assessRes.json();
  assessmentId = assessBody.data.id;
});

test.afterAll(async () => {
  /* TODO: clean up [E2E-TEST] records once DELETE endpoints are added to /api/v1/ */
});

test.describe("/api/v1/assessments", () => {
  test.describe.configure({ mode: "serial" });

  test("returns 401 with no Authorization header", async ({ request }) => {
    const res = await request.get("/api/v1/assessments");
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_API_KEY_FORMAT");
  });

  test("lists assessments — returns 200 with data array", async ({ request }) => {
    const res = await request.get("/api/v1/assessments", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.error).toBeNull();
  });

  test("returns 415 when Content-Type is not application/json for POST", async ({ request }) => {
    const res = await request.post("/api/v1/assessments", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "text/plain",
      },
      data: "vendorId=x",
    });
    expect(res.status()).toBe(415);
    const body = await res.json();
    expect(body.error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
    expect(body.data).toBeNull();
  });

  test("returns 400 VALIDATION_ERROR when vendorId is missing", async ({ request }) => {
    const res = await request.post("/api/v1/assessments", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      data: { riskLevel: "LOW" },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("returns 400 VALIDATION_ERROR when vendorId is not a valid cuid", async ({ request }) => {
    const res = await request.post("/api/v1/assessments", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      data: { vendorId: "not-a-cuid", riskLevel: "HIGH" },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("returns 404 VENDOR_NOT_FOUND when vendorId does not exist", async ({ request }) => {
    const res = await request.post("/api/v1/assessments", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      data: { vendorId: NONEXISTENT_ID, riskLevel: "MEDIUM" },
    });
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("VENDOR_NOT_FOUND");
  });

  test("created assessment has expected shape", async ({ request }) => {
    expect(assessmentId).toBeDefined();
    const res = await request.get(`/api/v1/assessments/${assessmentId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.error).toBeNull();
    expect(body.data.vendorId).toBe(vendorId);
    expect(body.data.riskLevel).toBe("HIGH");
    expect(body.data.complianceScore).toBe(45);
    expect(typeof body.data.id).toBe("string");
  });

  test("returns 409 ASSESSMENT_EXISTS when creating duplicate assessment for same vendor", async ({
    request,
  }) => {
    // assessmentId was set in the prior test — same vendorId already has an assessment
    const res = await request.post("/api/v1/assessments", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      data: { vendorId, riskLevel: "LOW" },
    });
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("ASSESSMENT_EXISTS");
  });

  test("GET /assessments/{id} — returns 200 with assessment fields", async ({ request }) => {
    expect(assessmentId).toBeDefined();
    const res = await request.get(`/api/v1/assessments/${assessmentId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe(assessmentId);
    expect(body.data.riskLevel).toBe("HIGH");
    expect(body.data.vendor).toBeDefined();
  });

  test("GET /assessments/{id} — returns 404 for nonexistent id", async ({ request }) => {
    const res = await request.get(`/api/v1/assessments/${NONEXISTENT_ID}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  test("PATCH risk-status — returns 415 without application/json", async ({ request }) => {
    expect(assessmentId).toBeDefined();
    const res = await request.patch(`/api/v1/assessments/${assessmentId}/risk-status`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "text/plain",
      },
      data: "status=IN_REVIEW",
    });
    expect(res.status()).toBe(415);
    const body = await res.json();
    expect(body.error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
    expect(body.data).toBeNull();
  });

  test("PATCH risk-status — returns 400 when body is empty", async ({ request }) => {
    expect(assessmentId).toBeDefined();
    const res = await request.patch(`/api/v1/assessments/${assessmentId}/risk-status`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      data: {},
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("PATCH risk-status — updates status field", async ({ request }) => {
    expect(assessmentId).toBeDefined();
    const res = await request.patch(`/api/v1/assessments/${assessmentId}/risk-status`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      data: { status: "IN_REVIEW" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe("IN_REVIEW");
    expect(body.error).toBeNull();
  });

  test("PATCH risk-status — updates riskLevel field", async ({ request }) => {
    expect(assessmentId).toBeDefined();
    const res = await request.patch(`/api/v1/assessments/${assessmentId}/risk-status`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      data: { riskLevel: "LOW" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.riskLevel).toBe("LOW");
  });

  test("PATCH risk-status — returns 404 for nonexistent assessment", async ({ request }) => {
    const res = await request.patch(`/api/v1/assessments/${NONEXISTENT_ID}/risk-status`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      data: { status: "COMPLETED" },
    });
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });
});
