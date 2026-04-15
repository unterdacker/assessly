import { describe, expect, it } from "vitest";

import { consumeApiKeyRequest } from "@/lib/api-rate-limit";

describe("api rate limiter", () => {
  it("allows the first 100 requests in a window", () => {
    const key = `test-key-${Date.now()}-allow`;

    for (let i = 0; i < 100; i += 1) {
      expect(consumeApiKeyRequest(key)).toBe(false);
    }
  });

  it("blocks when request count exceeds 100 in current window", () => {
    const key = `test-key-${Date.now()}-block`;

    for (let i = 0; i < 100; i += 1) {
      consumeApiKeyRequest(key);
    }

    expect(consumeApiKeyRequest(key)).toBe(true);
  });
});
