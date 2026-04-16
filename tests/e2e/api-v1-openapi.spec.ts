import { expect, test } from "@playwright/test";

test.describe("/api/v1/openapi.json", () => {
  test("returns 200 with application/json content-type", async ({ request }) => {
    const res = await request.get("/api/v1/openapi.json");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/json");
  });

  test("returns valid OpenAPI 3.1.0 spec", async ({ request }) => {
    const res = await request.get("/api/v1/openapi.json");
    const body = await res.json();
    expect(body.openapi).toBe("3.1.0");
    expect(body.info.title).toBe("VenShield API");
    expect(body.info.version).toBe("1.0.0");
  });

  test("spec documents all 9 expected operations", async ({ request }) => {
    const res = await request.get("/api/v1/openapi.json");
    const body = await res.json();
    const paths = body.paths;
    expect(paths["/vendors"]).toHaveProperty("get");
    expect(paths["/vendors"]).toHaveProperty("post");
    expect(paths["/vendors/{id}"]).toHaveProperty("get");
    expect(paths["/vendors/{id}"]).toHaveProperty("patch");
    expect(paths["/assessments"]).toHaveProperty("get");
    expect(paths["/assessments"]).toHaveProperty("post");
    expect(paths["/assessments/{id}"]).toHaveProperty("get");
    expect(paths["/assessments/{id}/risk-status"]).toHaveProperty("patch");
    expect(paths["/metrics"]).toHaveProperty("get");
  });

  test("spec includes bearerAuth security scheme", async ({ request }) => {
    const res = await request.get("/api/v1/openapi.json");
    const body = await res.json();
    expect(body.components.securitySchemes.bearerAuth).toBeDefined();
    expect(body.components.securitySchemes.bearerAuth.type).toBe("http");
    expect(body.components.securitySchemes.bearerAuth.scheme).toBe("bearer");
  });

  test("does not require authentication", async ({ request }) => {
    // OpenAPI spec must be publicly accessible — no auth header
    const res = await request.get("/api/v1/openapi.json");
    expect(res.status()).toBe(200);
  });
});

test.describe("/api/v1/docs", () => {
  test("returns 200 with text/html content-type", async ({ request }) => {
    const res = await request.get("/api/v1/docs");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/html");
  });

  test("returns Swagger UI HTML", async ({ request }) => {
    const res = await request.get("/api/v1/docs");
    const body = await res.text();
    expect(body).toContain("swagger-ui");
    expect(body).toContain("SwaggerUIBundle");
    expect(body).toContain("/api/v1/openapi.json");
  });

  test("includes Content-Security-Policy header", async ({ request }) => {
    const res = await request.get("/api/v1/docs");
    const csp = res.headers()["content-security-policy"];
    expect(csp).toBeDefined();
    expect(csp).toContain("script-src");
    expect(csp).toContain("cdn.jsdelivr.net");
  });

  test("includes X-Robots-Tag noindex header", async ({ request }) => {
    const res = await request.get("/api/v1/docs");
    expect(res.headers()["x-robots-tag"]).toContain("noindex");
  });

  test("does not require authentication", async ({ request }) => {
    const res = await request.get("/api/v1/docs");
    expect(res.status()).toBe(200);
  });
});
