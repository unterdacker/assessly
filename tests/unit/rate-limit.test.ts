import { beforeEach, describe, expect, it } from "vitest";
import {
  RATE_LIMIT_DEFAULTS,
  isRateLimited,
  readClientIp,
  registerFailure,
  resetFailures,
} from "@/lib/rate-limit";

beforeEach(() => {
  (globalThis as { __assesslyRateLimit?: Map<string, unknown> }).__assesslyRateLimit?.clear();
});

describe("RATE_LIMIT_DEFAULTS", () => {
  it("exposes expected defaults", () => {
    expect(RATE_LIMIT_DEFAULTS.maxFailures).toBe(5);
    expect(RATE_LIMIT_DEFAULTS.blockMs).toBe(600_000);
  });
});

describe("rate limit state transitions", () => {
  it("does not block unknown keys", () => {
    expect(isRateLimited("unknown")).toBe(false);
  });

  it("does not block before reaching max failures", () => {
    const key = "ip:10.0.0.1";
    for (let i = 0; i < 4; i += 1) {
      registerFailure(key);
    }

    expect(isRateLimited(key)).toBe(false);
  });

  it("blocks exactly at max failures", () => {
    const key = "ip:10.0.0.2";
    for (let i = 0; i < 5; i += 1) {
      registerFailure(key);
    }

    expect(isRateLimited(key)).toBe(true);
  });

  it("resetFailures removes blocking state", () => {
    const key = "ip:10.0.0.3";
    for (let i = 0; i < 5; i += 1) {
      registerFailure(key);
    }

    expect(isRateLimited(key)).toBe(true);

    resetFailures(key);

    expect(isRateLimited(key)).toBe(false);
  });

  it("supports custom maxFailures thresholds", () => {
    const key = "ip:10.0.0.4";
    registerFailure(key, { maxFailures: 2, blockMs: 60_000 });
    expect(isRateLimited(key)).toBe(false);

    registerFailure(key, { maxFailures: 2, blockMs: 60_000 });
    expect(isRateLimited(key)).toBe(true);
  });
});

describe("readClientIp", () => {
  it("returns x-real-ip when present", () => {
    const headers = {
      get(name: string) {
        if (name === "x-real-ip") return "203.0.113.10";
        return null;
      },
    };

    expect(readClientIp(headers)).toBe("203.0.113.10");
  });

  it("returns first x-forwarded-for hop", () => {
    const headers = {
      get(name: string) {
        if (name === "x-forwarded-for") return "10.0.0.1, 10.0.0.2";
        return null;
      },
    };

    expect(readClientIp(headers)).toBe("10.0.0.1");
  });

  it("returns unknown when no forwarding headers are present", () => {
    const headers = { get: () => null };

    expect(readClientIp(headers)).toBe("unknown");
  });

  it("prefers x-real-ip over x-forwarded-for", () => {
    const headers = {
      get(name: string) {
        if (name === "x-real-ip") return "198.51.100.25";
        if (name === "x-forwarded-for") return "10.0.0.1, 10.0.0.2";
        return null;
      },
    };

    expect(readClientIp(headers)).toBe("198.51.100.25");
  });
});
