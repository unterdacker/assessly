import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockResolve4, mockResolve6 } = vi.hoisted(() => ({
  mockResolve4: vi.fn<() => Promise<string[]>>(),
  mockResolve6: vi.fn<() => Promise<string[]>>(),
}));

vi.mock("dns/promises", () => ({
  resolve4: mockResolve4,
  resolve6: mockResolve6,
}));

import {
  OidcSsrfBlockedError,
  assertSafeHostname,
  createSsrfSafeFetch,
} from "@/lib/oidc/ssrf-guard";

const ISSUER = "https://idp.example.com";
const HOST = "idp.example.com";

async function expectBlocked(v4: string[] = [], v6: string[] = []): Promise<void> {
  mockResolve4.mockResolvedValue(v4);
  mockResolve6.mockResolvedValue(v6);
  await expect(assertSafeHostname(HOST, ISSUER)).rejects.toBeInstanceOf(OidcSsrfBlockedError);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockResolve4.mockResolvedValue([]);
  mockResolve6.mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OidcSsrfBlockedError", () => {
  it("exposes expected shape", () => {
    const error = new OidcSsrfBlockedError(ISSUER);

    expect(error.code).toBe("SSRF_BLOCKED");
    expect(error.message).toContain(ISSUER);
    expect(error.issuer).toBe(ISSUER);
    expect(error).toBeInstanceOf(Error);
  });
});

describe("assertSafeHostname blocked addresses", () => {
  it("blocks 127.0.0.1", async () => {
    await expectBlocked(["127.0.0.1"]);
  });

  it("blocks 10.10.0.1", async () => {
    await expectBlocked(["10.10.0.1"]);
  });

  it("blocks 172.20.0.1", async () => {
    await expectBlocked(["172.20.0.1"]);
  });

  it("blocks 192.168.1.1", async () => {
    await expectBlocked(["192.168.1.1"]);
  });

  it("blocks 169.254.0.1", async () => {
    await expectBlocked(["169.254.0.1"]);
  });

  it("blocks 100.96.0.1", async () => {
    await expectBlocked(["100.96.0.1"]);
  });

  it("blocks ::1", async () => {
    await expectBlocked([], ["::1"]);
  });

  it("blocks fc00::1", async () => {
    await expectBlocked([], ["fc00::1"]);
  });

  it("blocks fd12:3456::1", async () => {
    await expectBlocked([], ["fd12:3456::1"]);
  });

  it("blocks fe80::1", async () => {
    await expectBlocked([], ["fe80::1"]);
  });

  it("blocks IPv4-mapped ::ffff:127.0.0.1", async () => {
    await expectBlocked([], ["::ffff:127.0.0.1"]);
  });
});

describe("assertSafeHostname allowed addresses and special cases", () => {
  it("allows public IPv4", async () => {
    mockResolve4.mockResolvedValue(["203.0.113.1"]);
    mockResolve6.mockResolvedValue([]);

    await expect(assertSafeHostname(HOST, ISSUER)).resolves.toBeUndefined();
  });

  it("allows public IPv6", async () => {
    mockResolve4.mockResolvedValue([]);
    mockResolve6.mockResolvedValue(["2001:db8::1"]);

    await expect(assertSafeHostname(HOST, ISSUER)).resolves.toBeUndefined();
  });

  it("fails closed when no addresses are resolved", async () => {
    mockResolve4.mockResolvedValue([]);
    mockResolve6.mockResolvedValue([]);

    await expect(assertSafeHostname(HOST, ISSUER)).rejects.toBeInstanceOf(OidcSsrfBlockedError);
  });

  it("blocks when any resolved address is private", async () => {
    mockResolve4.mockResolvedValue(["203.0.113.1", "127.0.0.1"]);
    mockResolve6.mockResolvedValue([]);

    await expect(assertSafeHostname(HOST, ISSUER)).rejects.toBeInstanceOf(OidcSsrfBlockedError);
  });
});

describe("createSsrfSafeFetch", () => {
  it("throws for blocked hostname", async () => {
    mockResolve4.mockResolvedValue(["127.0.0.1"]);
    mockResolve6.mockResolvedValue([]);

    const safeFetch = createSsrfSafeFetch(ISSUER);

    await expect(safeFetch("https://blocked.example.com/resource")).rejects.toBeInstanceOf(
      OidcSsrfBlockedError,
    );
  });

  it("calls global fetch for allowed hostname", async () => {
    mockResolve4.mockResolvedValue(["203.0.113.1"]);
    mockResolve6.mockResolvedValue([]);

    const fetchSpy = vi.fn<typeof fetch>().mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", fetchSpy);

    const safeFetch = createSsrfSafeFetch(ISSUER);
    await safeFetch("https://public.example.com/resource");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith("https://public.example.com/resource", undefined);
  });

  it("handles Request object input", async () => {
    mockResolve4.mockResolvedValue(["203.0.113.1"]);
    mockResolve6.mockResolvedValue([]);

    const fetchSpy = vi.fn<typeof fetch>().mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", fetchSpy);

    const request = new Request("https://public.example.com/path");
    const safeFetch = createSsrfSafeFetch(ISSUER);
    await safeFetch(request);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(request, undefined);
  });
});
