/**
 * lib/rate-limit.ts
 *
 * Shared in-process consecutive-failure rate limiter.
 *
 * Design:
 * - State is stored in a Map<string, RateLimitState> pinned to globalThis so
 *   it survives Next.js HMR reloads in development.
 * - Hard capacity ceiling of MAX_ENTRIES prevents unbounded memory growth.
 *   When the ceiling is reached, the OLDEST ENTRY (Map insertion order) is
 *   evicted before a new key is inserted — this is FIFO eviction, not LRU.
 * - A cleanup interval removes entries whose block has expired, running every
 *   5 minutes and calling .unref() so it does not keep the Node.js process
 *   alive after all other work completes.
 *
 * SECURITY NOTES:
 * - IP-based limits are advisory-only. Without a trusted reverse proxy that
 *   strips/overwrites x-forwarded-for at the network edge, a client can rotate
 *   source IPs or forge x-forwarded-for to bypass IP-keyed limits. These
 *   limits add friction; they are not a cryptographic guarantee.
 * - FIFO eviction means an attacker who can fill the map with unique keys
 *   (e.g., via forged IPs) can evict older blocked entries. A correctly
 *   configured reverse proxy (nginx real_ip_from / real_ip_header) mitigates
 *   this in production.
 * - This module uses setInterval and must NEVER be imported in middleware.ts
 *   (Edge Runtime). It is safe in Node.js server actions and API routes.
 * - In multi-process or multi-replica deployments, each process holds
 *   independent state. Effective limits multiply by process count. For
 *   horizontal-scale deployments, replace the Map with a Redis-backed store.
 */

// ---------------------------------------------------------------------------
// Capacity
// ---------------------------------------------------------------------------

const MAX_ENTRIES = 100_000;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

type RateLimitState = {
  consecutiveFailures: number;
  blockedUntil: number; // epoch ms; 0 = not blocked
};

// ---------------------------------------------------------------------------
// Store — globalThis pin survives HMR reloads
// ---------------------------------------------------------------------------

const g = globalThis as typeof globalThis & {
  __venshieldRateLimit?: Map<string, RateLimitState>;
};
const rateLimitStore: Map<string, RateLimitState> =
  g.__venshieldRateLimit ?? new Map<string, RateLimitState>();
g.__venshieldRateLimit = rateLimitStore;

// ---------------------------------------------------------------------------
// Cleanup interval
// ---------------------------------------------------------------------------

const _cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, state] of rateLimitStore) {
    if (state.blockedUntil > 0 && state.blockedUntil <= now) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

// Guard: Node.js Timeout exposes .unref(); Edge/browser setInterval returns a
// plain number. Only call .unref() when the method actually exists.
if (
  typeof _cleanupInterval === "object" &&
  _cleanupInterval !== null &&
  "unref" in _cleanupInterval
) {
  (_cleanupInterval as NodeJS.Timeout).unref();
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getState(key: string): RateLimitState {
  return rateLimitStore.get(key) ?? { consecutiveFailures: 0, blockedUntil: 0 };
}

/**
 * Evicts the oldest entry (FIFO — Map insertion order) when the store is at
 * capacity and a brand-new key is about to be inserted. Updates to existing
 * keys never change the Map size.
 */
function evictOldestIfFull(key: string): void {
  if (!rateLimitStore.has(key) && rateLimitStore.size >= MAX_ENTRIES) {
    const oldestKey = rateLimitStore.keys().next().value;
    if (oldestKey !== undefined) rateLimitStore.delete(oldestKey);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Default thresholds — callers may override per endpoint. */
export const RATE_LIMIT_DEFAULTS = {
  maxFailures: 5,
  blockMs: 10 * 60 * 1000, // 10 minutes
} as const;

/**
 * Returns true when `key` is actively blocked (blockedUntil > now).
 * Does not mutate the store.
 */
export function isRateLimited(key: string): boolean {
  return getState(key).blockedUntil > Date.now();
}

/**
 * Increments the failure counter for `key`. When `consecutiveFailures` reaches
 * `maxFailures`, sets `blockedUntil = now + blockMs`.
 *
 * If the store is at capacity and `key` is new, the oldest entry is evicted
 * first (FIFO).
 */
export function registerFailure(
  key: string,
  opts?: { maxFailures?: number; blockMs?: number },
): void {
  const maxFailures = opts?.maxFailures ?? RATE_LIMIT_DEFAULTS.maxFailures;
  const blockMs = opts?.blockMs ?? RATE_LIMIT_DEFAULTS.blockMs;
  const state = getState(key);
  const nextFailures = state.consecutiveFailures + 1;
  const blockedUntil =
    nextFailures >= maxFailures ? Date.now() + blockMs : state.blockedUntil;

  evictOldestIfFull(key);
  rateLimitStore.set(key, { consecutiveFailures: nextFailures, blockedUntil });
}

/**
 * Removes the rate-limit entry for `key` (hard reset on success).
 * Called on successful authentication to clear the failure counter.
 */
export function resetFailures(key: string): void {
  rateLimitStore.delete(key);
}

/**
 * Reads the best available client IP from request headers.
 *
 * Preference:
 *   1. x-real-ip   — set by a trusted reverse proxy to the actual client IP.
 *   2. x-forwarded-for (first hop) — present in most CDN/LB setups but
 *      untrustworthy if the proxy chain is not controlled end-to-end.
 *
 * SECURITY NOTE: Both headers can be forged in the absence of a trusted proxy.
 * IP-based rate limits are advisory-only — see module-level notes above.
 *
 * @param headers  Any object exposing a `.get(name): string | null` method
 *                 (Next.js ReadonlyHeaders, NextRequest.headers, etc.)
 */
export function readClientIp(
  headers: { get(name: string): string | null },
): string {
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  return "unknown";
}