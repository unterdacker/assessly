import { expect, test } from "@playwright/test";
import { getTestApiKey } from "./helpers/api-key";

// Valid-format CUID that does not exist in the database
const NONEXISTENT_ID = "clzzzzzzzzzzzzzzzzzzzzzzz";

let apiKey: string;

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  apiKey = await getTestApiKey(page);
  await page.close();
});

test.describe("/api/v1/vendors", () => {
  test("returns 401 with no Authorization header", async ({ request }) => {
    const res = await request.get("/api/v1/vendors");
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_API_KEY_FORMAT");
  });

  test("returns 401 with malformed key", async ({ request }) => {
    const res = await request.get("/api/v1/vendors", {
      headers: { Authorization: "Bearer not-a-real-key" },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_API_KEY_FORMAT");
  });

  test("lists vendors — returns 200 with data array", async ({ request }) => {
    const res = await request.get("/api/v1/vendors", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.error).toBeNull();
  });

  test("returns 415 when Content-Type is not application/json", async ({ request }) => {
    const res = await request.post("/api/v1/vendors", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "text/plain",
      },
      data: "name=Test",
    });
    expect(res.status()).toBe(415);
    const body = await res.json();
    expect(body.error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
    expect(body.data).toBeNull();
  });

  test("returns 400 VALIDATION_ERROR when name is missing", async ({ request }) => {
    const res = await request.post("/api/v1/vendors", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      data: { email: "test@example.com", serviceType: "Cloud" },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("returns 400 VALIDATION_ERROR when email is invalid", async ({ request }) => {
    const res = await request.post("/api/v1/vendors", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      data: { name: "[E2E-TEST] Bad Email", email: "not-an-email", serviceType: "Cloud" },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("creates a vendor — returns 201 with vendor data", async ({ request }) => {
    const uniqueEmail = `e2e-vendor-${Date.now()}@example.com`;
    const res = await request.post("/api/v1/vendors", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      data: {
        name: `[E2E-TEST] Vendor ${Date.now()}`,
        email: uniqueEmail,
        serviceType: "Cloud Storage",
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.error).toBeNull();
    expect(typeof body.data.id).toBe("string");
    expect(body.data.name).toContain("[E2E-TEST]");
    expect(body.data.email).toBe(uniqueEmail);
  });

  test("GET /vendors/{id} — returns 200 with vendor fields", async ({ request }) => {
    const uniqueEmail = `fetch-target-${Date.now()}@example.com`;
    // Create a vendor to fetch
    const createRes = await request.post("/api/v1/vendors", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      data: {
        name: `[E2E-TEST] Fetch Target ${Date.now()}`,
        email: uniqueEmail,
        serviceType: "SaaS",
      },
    });
    expect(createRes.status()).toBe(201);
    const { data: created } = await createRes.json();

    const res = await request.get(`/api/v1/vendors/${created.id}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe(created.id);
    expect(body.data.email).toBe(uniqueEmail);
  });

  test("GET /vendors/{id} — returns 404 for nonexistent id", async ({ request }) => {
    const res = await request.get(`/api/v1/vendors/${NONEXISTENT_ID}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  test("PATCH /vendors/{id} — updates a field and returns 200", async ({ request }) => {
    // Create a vendor to patch
    const createRes = await request.post("/api/v1/vendors", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      data: {
        name: `[E2E-TEST] Patch Target ${Date.now()}`,
        email: `patch-target-${Date.now()}@example.com`,
        serviceType: "On-Premise",
      },
    });
    expect(createRes.status()).toBe(201);
    const { data: created } = await createRes.json();

    const patchRes = await request.patch(`/api/v1/vendors/${created.id}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      data: { name: "[E2E-TEST] Updated Name" },
    });
    expect(patchRes.status()).toBe(200);
    const body = await patchRes.json();
    expect(body.data.name).toBe("[E2E-TEST] Updated Name");
    expect(body.error).toBeNull();
  });

  test("PATCH /vendors/{id} — returns 400 when body is empty object", async ({ request }) => {
    // Create a vendor to attempt patching
    const createRes = await request.post("/api/v1/vendors", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      data: {
        name: `[E2E-TEST] Empty Patch ${Date.now()}`,
        email: `empty-patch-${Date.now()}@example.com`,
        serviceType: "Hybrid",
      },
    });
    expect(createRes.status()).toBe(201);
    const { data: created } = await createRes.json();

    const patchRes = await request.patch(`/api/v1/vendors/${created.id}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      data: {},
    });
    expect(patchRes.status()).toBe(400);
    const body = await patchRes.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("PATCH /vendors/{id} — returns 415 without application/json content-type", async ({ request }) => {
    // Create a real vendor to ensure the 415 check is hit before 404
    const createRes = await request.post("/api/v1/vendors", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      data: {
        name: `[E2E-TEST] 415 Target ${Date.now()}`,
        email: `e2e-415-target-${Date.now()}@example.com`,
        serviceType: "Testing",
      },
    });
    expect(createRes.status()).toBe(201);
    const { data: created } = await createRes.json();

    const res = await request.patch(`/api/v1/vendors/${created.id}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "text/plain",
      },
      data: "name=Updated",
    });
    expect(res.status()).toBe(415);
    const body = await res.json();
    expect(body.error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
    expect(body.data).toBeNull();
  });

  test("PATCH /vendors/{id} — returns 404 for nonexistent id", async ({ request }) => {
    const patchRes = await request.patch(`/api/v1/vendors/${NONEXISTENT_ID}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      data: { name: "[E2E-TEST] Ghost Patch" },
    });
    expect(patchRes.status()).toBe(404);
    const body = await patchRes.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });
});
