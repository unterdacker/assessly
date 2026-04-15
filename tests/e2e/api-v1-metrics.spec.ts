import { expect, test } from "@playwright/test";
import { getTestApiKey } from "./helpers/api-key";

let apiKey: string;

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  apiKey = await getTestApiKey(page);
  await page.close();
});

test.describe("/api/v1/metrics", () => {
  test("returns 401 with no Authorization header", async ({ request }) => {
    const res = await request.get("/api/v1/metrics");
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_API_KEY_FORMAT");
  });

  test("returns 401 with malformed key", async ({ request }) => {
    const res = await request.get("/api/v1/metrics", {
      headers: { Authorization: "Bearer invalid-key-format" },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_API_KEY_FORMAT");
  });

  test("returns 200 with valid key — metrics shape is correct", async ({ request }) => {
    const res = await request.get("/api/v1/metrics", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.error).toBeNull();
    expect(typeof body.data.totalRequests).toBe("number");
    expect(typeof body.data.activeKeys).toBe("number");
    expect(typeof body.data.totalKeys).toBe("number");
    expect(Array.isArray(body.data.apiKeys)).toBe(true);
    expect(body.data.totalKeys).toBeGreaterThanOrEqual(1);
    expect(body.data.activeKeys).toBeGreaterThanOrEqual(1);
  });

  test("each key in apiKeys array has required fields", async ({ request }) => {
    const res = await request.get("/api/v1/metrics", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    for (const key of body.data.apiKeys) {
      expect(typeof key.id).toBe("string");
      expect(typeof key.name).toBe("string");
      expect(typeof key.keyPrefix).toBe("string");
      expect(Array.isArray(key.scopes)).toBe(true);
      expect(typeof key.usageCount).toBe("number");
      expect(typeof key.isActive).toBe("boolean");
    }
  });

  test("totalRequests reflects sum of individual usageCounts", async ({ request }) => {
    const res = await request.get("/api/v1/metrics", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const sum = body.data.apiKeys.reduce(
      (acc: number, k: { usageCount: number }) => acc + k.usageCount,
      0,
    );
    expect(body.data.totalRequests).toBe(sum);
  });
});
