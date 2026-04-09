import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { decrypt, encrypt } from "@/lib/crypto";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("lib/crypto", () => {
  it("round-trips plaintext using the dev fallback key", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("SETTINGS_ENCRYPTION_KEY", "");

    const ciphertext = encrypt("hello");
    expect(decrypt(ciphertext)).toBe("hello");
  });

  it("produces different ciphertexts for the same plaintext", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("SETTINGS_ENCRYPTION_KEY", "");

    const first = encrypt("hello");
    const second = encrypt("hello");

    expect(first).not.toBe(second);
  });

  it("throws when ciphertext authentication is tampered", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("SETTINGS_ENCRYPTION_KEY", "");

    const ciphertext = encrypt("hello");
    const [iv, tag, data] = ciphertext.split(":");
    const tampered = `${iv}:${tag}:${data.slice(0, -1)}${data.slice(-1) === "0" ? "1" : "0"}`;

    expect(() => decrypt(tampered)).toThrow();
  });

  it("throws on malformed ciphertext format", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("SETTINGS_ENCRYPTION_KEY", "");

    expect(() => decrypt("bad-format")).toThrow("Invalid ciphertext format");
  });

  it("requires SETTINGS_ENCRYPTION_KEY in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SETTINGS_ENCRYPTION_KEY", "");

    expect(() => encrypt("hello")).toThrow("required in production");
  });

  it("validates key length as 64 hex chars", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("SETTINGS_ENCRYPTION_KEY", "aabb");

    expect(() => encrypt("hello")).toThrow("64-character hex");
  });

  it("round-trips with an explicit valid 64-char hex key", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SETTINGS_ENCRYPTION_KEY", "aa".repeat(32));

    const ciphertext = encrypt("hello");
    expect(decrypt(ciphertext)).toBe("hello");
  });

  it("round-trips an empty plaintext", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SETTINGS_ENCRYPTION_KEY", "aa".repeat(32));

    const ciphertext = encrypt("");
    expect(decrypt(ciphertext)).toBe("");
  });

  it("round-trips unicode plaintext", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SETTINGS_ENCRYPTION_KEY", "aa".repeat(32));

    const ciphertext = encrypt("héllo wörld");
    expect(decrypt(ciphertext)).toBe("héllo wörld");
  });
});
