import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  generateApiKey,
  hashApiKey,
  extractKeyPrefix,
} from "@/modules/api-keys/lib/key-generator";

describe("api key generator", () => {
  it("generates keys with expected prefix and length", () => {
    const key = generateApiKey();

    expect(key.startsWith("vs_live_")).toBe(true);
    expect(key).toHaveLength(72);
    expect(key.slice(8)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hashes deterministically to a 64-char sha256 hex digest", () => {
    const raw = "vs_live_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    const one = hashApiKey(raw);
    const two = hashApiKey(raw);

    expect(one).toBe(two);
    expect(one).toMatch(/^[0-9a-f]{64}$/);
  });

  it("extracts the display prefix from the random payload", () => {
    const key = "vs_live_a1b2c3d4e5f6a7b8c9d0";
    expect(extractKeyPrefix(key)).toBe("a1b2c3d4");
  });
});
