import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  decryptWebhookSecret,
  encryptWebhookSecret,
} from "@/modules/webhooks/lib/webhook-crypto";

describe("webhook-crypto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("WEBHOOK_ENCRYPTION_KEY", "11".repeat(32));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("encryptWebhookSecret + decryptWebhookSecret roundtrip returns plaintext", () => {
    const plaintext = "super-secret-token";
    const ciphertext = encryptWebhookSecret(plaintext);

    const decrypted = decryptWebhookSecret(ciphertext);

    expect(decrypted).toBe(plaintext);
  });

  it("different plaintexts produce different ciphertexts", () => {
    const ciphertextA = encryptWebhookSecret("secret-a");
    const ciphertextB = encryptWebhookSecret("secret-b");

    expect(ciphertextA).not.toBe(ciphertextB);
  });

  it("decryptWebhookSecret throws on malformed ciphertext", () => {
    expect(() => decryptWebhookSecret("iv:tag")).toThrow(
      /Invalid webhook secret ciphertext format/i,
    );
  });

  it("decryptWebhookSecret throws when GCM auth tag is tampered", () => {
    const ciphertext = encryptWebhookSecret("secret-to-protect");
    const [ivHex, tagHex, dataHex] = ciphertext.split(":");
    const tamperedTag = `${tagHex[0] === "a" ? "b" : "a"}${tagHex.slice(1)}`;
    const tamperedCiphertext = `${ivHex}:${tamperedTag}:${dataHex}`;

    expect(() => decryptWebhookSecret(tamperedCiphertext)).toThrow();
  });

  it("uses dev fallback key when WEBHOOK_ENCRYPTION_KEY is missing outside production", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("WEBHOOK_ENCRYPTION_KEY", undefined);

    const plaintext = "fallback-secret";
    const ciphertext = encryptWebhookSecret(plaintext);

    expect(decryptWebhookSecret(ciphertext)).toBe(plaintext);
  });

  it("throws in production when WEBHOOK_ENCRYPTION_KEY is missing", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("WEBHOOK_ENCRYPTION_KEY", undefined);

    expect(() => encryptWebhookSecret("secret")).toThrow(
      /WEBHOOK_ENCRYPTION_KEY env variable is required in production/i,
    );
  });

  it("throws when WEBHOOK_ENCRYPTION_KEY length is not 32 bytes", () => {
    vi.stubEnv("WEBHOOK_ENCRYPTION_KEY", "aa".repeat(16));

    expect(() => encryptWebhookSecret("secret")).toThrow(/64-character hex string/i);
  });
});