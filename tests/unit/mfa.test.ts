import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockGenerateSecret, mockGenerateUri, mockVerifySync } = vi.hoisted(() => ({
  mockGenerateSecret: vi.fn(),
  mockGenerateUri: vi.fn(),
  mockVerifySync: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("otplib", () => ({
  generateSecret: mockGenerateSecret,
  generateURI: mockGenerateUri,
  verifySync: mockVerifySync,
}));

import {
  decryptMfaSecret,
  encryptMfaSecret,
  generateTotpUri,
  generateTotpSecret,
  verifyTotpToken,
} from "@/lib/mfa";

const TEST_KEY = "aa".repeat(32); // test-only fixture, never use in production

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllEnvs());

describe("getMfaEncryptionKey (error branches)", () => {
  beforeEach(() => {
    vi.stubEnv("MFA_ENCRYPTION_KEY", "");
  });

  it("uses the dev-only fallback in non-production when no key is set", () => {
    vi.stubEnv("MFA_ENCRYPTION_KEY", "");
    vi.stubEnv("NODE_ENV", "test");

    const ciphertext = encryptMfaSecret("any");
    const plaintext = decryptMfaSecret(ciphertext);

    expect(plaintext).toBe("any");
  });

  it("throws in production when MFA_ENCRYPTION_KEY is absent", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(() => encryptMfaSecret("test")).toThrow("MFA_ENCRYPTION_KEY env variable is required");
  });

  it("throws when key is not 64 hex chars", () => {
    vi.stubEnv("MFA_ENCRYPTION_KEY", "aabb");

    expect(() => encryptMfaSecret("test")).toThrow("64-char hex");
  });
});

describe("generateTotpSecret", () => {
  it("delegates to otplib and returns the result", () => {
    mockGenerateSecret.mockReturnValue("JBSWY3DPEHPK3PXP");

    const result = generateTotpSecret();

    expect(result).toBe("JBSWY3DPEHPK3PXP");
    expect(mockGenerateSecret).toHaveBeenCalledTimes(1);
    expect(mockGenerateSecret).toHaveBeenCalledWith();
  });
});

describe("generateTotpUri", () => {
  it("delegates to otplib generateURI and returns the result", () => {
    mockGenerateUri.mockReturnValue(
      "otpauth://totp/Venshield:test@example.com?secret=ABC&issuer=Venshield",
    );

    const result = generateTotpUri("test@example.com", "ABC");

    expect(result).toBe("otpauth://totp/Venshield:test@example.com?secret=ABC&issuer=Venshield");
    expect(mockGenerateUri).toHaveBeenCalledWith({
      issuer: "Venshield",
      label: "test@example.com",
      secret: "ABC",
    });
  });
});

describe("encryptMfaSecret / decryptMfaSecret", () => {
  it("roundtrip preserves the plaintext", () => {
    vi.stubEnv("MFA_ENCRYPTION_KEY", TEST_KEY);

    const ciphertext = encryptMfaSecret("my-totp-secret");
    const plaintext = decryptMfaSecret(ciphertext);

    expect(plaintext).toBe("my-totp-secret");
  });

  it("ciphertext matches iv:tag:data hex format", () => {
    vi.stubEnv("MFA_ENCRYPTION_KEY", TEST_KEY);

    const ciphertext = encryptMfaSecret("my-totp-secret");

    expect(ciphertext).toMatch(/^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/);
  });

  it("decryptMfaSecret throws on a ciphertext with fewer than 3 parts", () => {
    vi.stubEnv("MFA_ENCRYPTION_KEY", TEST_KEY);

    expect(() => decryptMfaSecret("bad:only")).toThrow("Invalid MFA secret ciphertext format");
  });

  it("uses a unique IV on each encryption", () => {
    vi.stubEnv("MFA_ENCRYPTION_KEY", TEST_KEY);

    const first = encryptMfaSecret("same");
    const second = encryptMfaSecret("same");
    const iv1 = first.split(":")[0];
    const iv2 = second.split(":")[0];

    expect(iv1).not.toBe(iv2);
  });
});

describe("verifyTotpToken", () => {
  it("returns true when the TOTP code is valid", () => {
    vi.stubEnv("MFA_ENCRYPTION_KEY", TEST_KEY);
    const ciphertext = encryptMfaSecret("TESTSECRET");
    mockVerifySync.mockReturnValue({ valid: true });

    const result = verifyTotpToken("123456", ciphertext);

    expect(result).toBe(true);
    expect(mockVerifySync).toHaveBeenCalledWith({ token: "123456", secret: "TESTSECRET" });
  });

  it("returns false when the TOTP code is invalid", () => {
    vi.stubEnv("MFA_ENCRYPTION_KEY", TEST_KEY);
    const ciphertext = encryptMfaSecret("TESTSECRET");
    mockVerifySync.mockReturnValue({ valid: false });

    const result = verifyTotpToken("000000", ciphertext);

    expect(result).toBe(false);
  });

  it("returns false without throwing when ciphertext is corrupted", () => {
    const result = verifyTotpToken("123456", "not:valid:hex");

    expect(result).toBe(false);
  });
});
