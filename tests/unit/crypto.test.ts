import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { decrypt, decryptFile, encrypt, encryptFile } from "@/lib/crypto";

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

describe("encryptFile / decryptFile", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("round-trips a Buffer using the dev fallback key", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("STORAGE_ENCRYPTION_KEY", "");
    const input = Buffer.from("binary data");
    expect(decryptFile(encryptFile(input))).toEqual(input);
  });

  it("produces a different ciphertext on each call for identical input", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("STORAGE_ENCRYPTION_KEY", "");
    const a = encryptFile(Buffer.from("x"));
    const b = encryptFile(Buffer.from("x"));
    expect(a).not.toEqual(b);
  });

  it("output is exactly 28 bytes longer than input (12B IV + 16B GCM tag)", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("STORAGE_ENCRYPTION_KEY", "");
    expect(encryptFile(Buffer.alloc(0))).toHaveLength(28);
    expect(encryptFile(Buffer.alloc(10))).toHaveLength(38);
  });

  it("round-trips an empty buffer", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("STORAGE_ENCRYPTION_KEY", "");
    expect(decryptFile(encryptFile(Buffer.alloc(0)))).toEqual(Buffer.alloc(0));
  });

  it("round-trips a large buffer (1 KB)", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("STORAGE_ENCRYPTION_KEY", "");
    const big = Buffer.alloc(1024, 0xab);
    expect(decryptFile(encryptFile(big))).toEqual(big);
  });

  it("round-trips with an explicit valid 64-char hex STORAGE_ENCRYPTION_KEY", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STORAGE_ENCRYPTION_KEY", "bb".repeat(32));
    const input = Buffer.from("hello binary");
    expect(decryptFile(encryptFile(input))).toEqual(input);
  });

  it("throws when the GCM auth tag is tampered (flip byte 12)", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("STORAGE_ENCRYPTION_KEY", "");
    const ct = encryptFile(Buffer.from("secret"));
    ct[12] ^= 0xff;
    expect(() => decryptFile(ct)).toThrow();
  });

  it("throws when buffer is shorter than 28 bytes", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("STORAGE_ENCRYPTION_KEY", "");
    expect(() => decryptFile(Buffer.alloc(27))).toThrow(/minimum 28 bytes/i);
    expect(() => decryptFile(Buffer.alloc(0))).toThrow(/minimum 28 bytes/i);
  });
});

describe("STORAGE_ENCRYPTION_KEY validation (via encryptFile)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("throws in production when STORAGE_ENCRYPTION_KEY is absent", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STORAGE_ENCRYPTION_KEY", "");
    expect(() => encryptFile(Buffer.from("x"))).toThrow(/required in production/i);
  });

  it("uses dev fallback without throwing in non-production when key is absent", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("STORAGE_ENCRYPTION_KEY", "");
    const out = encryptFile(Buffer.from("x"));
    expect(decryptFile(out)).toEqual(Buffer.from("x"));
  });

  it("rejects a STORAGE_ENCRYPTION_KEY that is not 64 hex chars (too short)", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("STORAGE_ENCRYPTION_KEY", "aabb");
    expect(() => encryptFile(Buffer.from("x"))).toThrow(/64-character hex/i);
  });

  it("rejects a key containing non-hex characters", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("STORAGE_ENCRYPTION_KEY", "Z".repeat(64));
    expect(() => encryptFile(Buffer.from("x"))).toThrow(/64-character hex/i);
  });
});
