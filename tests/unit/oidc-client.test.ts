import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ env: { APP_URL: "https://app.example.com" } }));

const {
  mockDiscovery,
  mockBuildAuthorizationUrl,
  mockAuthorizationCodeGrant,
  MOCK_CUSTOM_FETCH_SYMBOL,
} = vi.hoisted(() => ({
  mockDiscovery: vi.fn(),
  mockBuildAuthorizationUrl: vi.fn(),
  mockAuthorizationCodeGrant: vi.fn(),
  MOCK_CUSTOM_FETCH_SYMBOL: Symbol("customFetch"),
}));

vi.mock("openid-client", () => ({
  discovery: mockDiscovery,
  buildAuthorizationUrl: mockBuildAuthorizationUrl,
  authorizationCodeGrant: mockAuthorizationCodeGrant,
  customFetch: MOCK_CUSTOM_FETCH_SYMBOL,
}));

const { mockAssertSafeHostname, mockCreateSsrfSafeFetch } = vi.hoisted(() => ({
  mockAssertSafeHostname: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  mockCreateSsrfSafeFetch: vi.fn().mockReturnValue(vi.fn()),
}));

const { MockOidcSsrfBlockedError } = vi.hoisted(() => ({
  MockOidcSsrfBlockedError: class MockOidcSsrfBlockedError extends Error {
    readonly code = "SSRF_BLOCKED" as const;

    constructor(readonly issuer: string) {
      super(`SSRF: blocked issuer ${issuer}`);
    }
  },
}));

vi.mock("@/lib/oidc/ssrf-guard", () => ({
  assertSafeHostname: mockAssertSafeHostname,
  createSsrfSafeFetch: mockCreateSsrfSafeFetch,
  OidcSsrfBlockedError: MockOidcSsrfBlockedError,
}));

import {
  OidcError,
  buildOidcAuthorizationUrl,
  discoverOidcClient,
  exchangeOidcCode,
} from "@/lib/oidc/client";

const MOCK_CONFIG = {
  companyId: "company-1",
  clientId: "client-id",
  clientSecret: "client-secret",
  issuerUrl: "https://idp.example.com",
  isEnabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const MOCK_CLIENT_CONFIG = {
  serverMetadata: () => ({ issuer: "https://idp.example.com" }),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockAssertSafeHostname.mockResolvedValue(undefined);
  mockCreateSsrfSafeFetch.mockReturnValue(vi.fn());
});

describe("OidcError", () => {
  it("sets code, issuer, message, cause and name", () => {
    const cause = new Error("root-cause");
    const error = new OidcError("DISCOVERY_FAILED", "https://idp.example.com", "failed", cause);

    expect(error.code).toBe("DISCOVERY_FAILED");
    expect(error.issuer).toBe("https://idp.example.com");
    expect(error.message).toBe("failed");
    expect(error.cause).toBe(cause);
    expect(error.name).toBe("OidcError");
  });

  it("is an Error instance", () => {
    const error = new OidcError("DISCOVERY_FAILED", "https://idp.example.com", "failed");

    expect(error).toBeInstanceOf(Error);
  });
});

describe("discoverOidcClient", () => {
  it("throws DISCOVERY_FAILED for invalid issuer URL", async () => {
    await expect(
      discoverOidcClient({ ...MOCK_CONFIG, issuerUrl: "not a valid url" }),
    ).rejects.toMatchObject({
      name: "OidcError",
      code: "DISCOVERY_FAILED",
      issuer: "not a valid url",
    });
  });

  it("throws SSRF_BLOCKED when SSRF guard blocks hostname", async () => {
    mockAssertSafeHostname.mockRejectedValue(new MockOidcSsrfBlockedError(MOCK_CONFIG.issuerUrl));

    await expect(discoverOidcClient(MOCK_CONFIG)).rejects.toMatchObject({
      name: "OidcError",
      code: "SSRF_BLOCKED",
      issuer: MOCK_CONFIG.issuerUrl,
    });
  });

  it("rethrows non-SSRF errors from assertSafeHostname", async () => {
    const err = new Error("dns failed");
    mockAssertSafeHostname.mockRejectedValue(err);

    await expect(discoverOidcClient(MOCK_CONFIG)).rejects.toBe(err);
  });

  it("returns configuration when discovery succeeds", async () => {
    const discovered = { serverMetadata: () => ({ issuer: MOCK_CONFIG.issuerUrl }) };
    mockDiscovery.mockResolvedValue(discovered);

    const result = await discoverOidcClient(MOCK_CONFIG);

    expect(result).toBe(discovered);
    expect(mockDiscovery).toHaveBeenCalledTimes(1);
  });

  it("maps fetch failed discovery errors to IDP_UNREACHABLE", async () => {
    mockDiscovery.mockRejectedValue(new Error("fetch failed"));

    await expect(discoverOidcClient(MOCK_CONFIG)).rejects.toMatchObject({
      name: "OidcError",
      code: "IDP_UNREACHABLE",
    });
  });

  it("maps enotfound discovery errors to IDP_UNREACHABLE", async () => {
    mockDiscovery.mockRejectedValue(new Error("getaddrinfo ENOTFOUND idp.example.com"));

    await expect(discoverOidcClient(MOCK_CONFIG)).rejects.toMatchObject({
      name: "OidcError",
      code: "IDP_UNREACHABLE",
    });
  });

  it("maps non-network discovery errors to DISCOVERY_FAILED", async () => {
    mockDiscovery.mockRejectedValue(new Error("unknown parsing error"));

    await expect(discoverOidcClient(MOCK_CONFIG)).rejects.toMatchObject({
      name: "OidcError",
      code: "DISCOVERY_FAILED",
    });
  });

  it("maps SSRF error from discovery to SSRF_BLOCKED", async () => {
    mockDiscovery.mockRejectedValue(new MockOidcSsrfBlockedError(MOCK_CONFIG.issuerUrl));

    await expect(discoverOidcClient(MOCK_CONFIG)).rejects.toMatchObject({
      name: "OidcError",
      code: "SSRF_BLOCKED",
    });
  });

  it("treats non-Error thrown values as DISCOVERY_FAILED", async () => {
    mockDiscovery.mockRejectedValue("plain string throw");

    await expect(discoverOidcClient(MOCK_CONFIG)).rejects.toMatchObject({
      name: "OidcError",
      code: "DISCOVERY_FAILED",
    });
  });
});

describe("buildOidcAuthorizationUrl", () => {
  it("passes expected OIDC authorization parameters", () => {
    const returnedUrl = new URL("https://idp.example.com/authorize");
    mockBuildAuthorizationUrl.mockReturnValue(returnedUrl);

    const result = buildOidcAuthorizationUrl(
      MOCK_CLIENT_CONFIG as unknown,
      "state-1",
      "nonce-1",
      "pkce-verifier-1",
    );

    expect(result).toBe(returnedUrl);
    expect(mockBuildAuthorizationUrl).toHaveBeenCalledTimes(1);
    expect(mockBuildAuthorizationUrl).toHaveBeenCalledWith(
      MOCK_CLIENT_CONFIG,
      expect.objectContaining({
        scope: "openid email profile",
        code_challenge_method: "S256",
        redirect_uri: "https://app.example.com/api/auth/oidc/callback",
      }),
    );
  });
});

describe("exchangeOidcCode", () => {
  it("returns normalized token claims when grant succeeds", async () => {
    mockAuthorizationCodeGrant.mockResolvedValue({
      claims: () => ({
        sub: "sub1",
        email: "a@b.com",
        email_verified: true,
        name: "Alice",
      }),
    });

    const result = await exchangeOidcCode(
      MOCK_CLIENT_CONFIG as unknown,
      "code-1",
      "pkce-1",
      "nonce-1",
      "state-1",
    );

    expect(result).toEqual({
      sub: "sub1",
      email: "a@b.com",
      email_verified: true,
      name: "Alice",
    });
  });

  it("throws INVALID_ID_TOKEN when claims are undefined", async () => {
    mockAuthorizationCodeGrant.mockResolvedValue({
      claims: () => undefined,
    });

    await expect(
      exchangeOidcCode(MOCK_CLIENT_CONFIG as unknown, "code-1", "pkce-1", "nonce-1", "state-1"),
    ).rejects.toMatchObject({
      name: "OidcError",
      code: "INVALID_ID_TOKEN",
    });
  });

  it("throws INVALID_ID_TOKEN when required claims are missing", async () => {
    mockAuthorizationCodeGrant.mockResolvedValue({
      claims: () => ({}),
    });

    await expect(
      exchangeOidcCode(MOCK_CLIENT_CONFIG as unknown, "code-1", "pkce-1", "nonce-1", "state-1"),
    ).rejects.toMatchObject({
      name: "OidcError",
      code: "INVALID_ID_TOKEN",
    });
  });

  it("throws SSRF_BLOCKED when grant throws SSRF error", async () => {
    mockAuthorizationCodeGrant.mockRejectedValue(
      new MockOidcSsrfBlockedError("https://idp.example.com"),
    );

    await expect(
      exchangeOidcCode(MOCK_CLIENT_CONFIG as unknown, "code-1", "pkce-1", "nonce-1", "state-1"),
    ).rejects.toMatchObject({
      name: "OidcError",
      code: "SSRF_BLOCKED",
    });
  });

  it("throws TOKEN_EXCHANGE_FAILED when grant throws generic error", async () => {
    mockAuthorizationCodeGrant.mockRejectedValue(new Error("grant failed"));

    await expect(
      exchangeOidcCode(MOCK_CLIENT_CONFIG as unknown, "code-1", "pkce-1", "nonce-1", "state-1"),
    ).rejects.toMatchObject({
      name: "OidcError",
      code: "TOKEN_EXCHANGE_FAILED",
    });
  });

  it("rethrows OidcError as-is", async () => {
    const existing = new OidcError(
      "TOKEN_EXCHANGE_FAILED",
      "https://idp.example.com",
      "already wrapped",
    );
    mockAuthorizationCodeGrant.mockRejectedValue(existing);

    await expect(
      exchangeOidcCode(MOCK_CLIENT_CONFIG as unknown, "code-1", "pkce-1", "nonce-1", "state-1"),
    ).rejects.toBe(existing);
  });
});
