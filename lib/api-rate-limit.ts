/**
 * lib/api-rate-limit.ts
 *
 * Fixed-window request counters for REST API rate limiting.
 * Two independent limiters:
 *   1. Per API key: 100 req/min  (consumeApiKeyRequest)
 *   2. Per IP:      300 req/min  (consumeIpRequest), with LRU eviction
 *
 * SECURITY NOTES (same as lib/rate-limit.ts):
 * - IP-based limits are advisory-only. Without a trusted reverse proxy that
 *   strips/overwrites x-forwarded-for at the network edge, a client can forge
 *   source IPs to bypass IP-keyed limits. These limits add friction; they are
 *   not a cryptographic guarantee. Configure nginx real_ip_from or equivalent.
 * - The IP store uses LRU eviction: active entries are never displaced by an
 *   attacker filling the store with unique keys.
 * - The API key store uses FIFO eviction (keys are DB cuids — not forgeable by
 *   clients, so this does not create a bypass vector).
 * - In multi-replica deployments, effective limits multiply by replica count.
 *   Replace Map stores with Redis INCR+EXPIRE for production horizontal scale.
 * - NOT safe for Edge Runtime. Do not import in middleware.ts.
 *
 * PRIVACY (GDPR):
 * - IPv4: full address used as key; IPv6: /64 prefix (64-bit subnet).
 * - Legal basis: Legitimate interest (GDPR Art. 6(1)(f)) — security/abuse prevention.
 * - Retention: In-memory only; auto-expires at next cleanup cycle (≤5 min).
 * - IP addresses are NOT persisted to disk or database by this module.
 * - The sign-out endpoint and /api/v1/* routes share the same per-IP quota,
 *   providing a single cohesive rate limit across all public API endpoints.
 */

import { isIPv4, isIPv6 } from "net";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WINDOW_MS = 60_000; // 1 minute

const KEY_MAX_REQUESTS = 100;
const KEY_MAX_ENTRIES = 50_000;

const IP_MAX_REQUESTS = 300;
const IP_MAX_ENTRIES = 50_000;
/** Requests without a detectable IP share this stricter quota. */
const UNKNOWN_IP_LIMIT = 30;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type WindowState = { count: number; windowStart: number };

// ---------------------------------------------------------------------------
// Stores — globalThis pins survive Next.js HMR reloads in development
// ---------------------------------------------------------------------------

const g = globalThis as typeof globalThis & {
  __venshieldApiRateLimit?: Map<string, WindowState>;
  __venshieldApiIpRateLimit?: Map<string, WindowState>;
};

const keyStore: Map<string, WindowState> =
  g.__venshieldApiRateLimit ?? new Map();
g.__venshieldApiRateLimit = keyStore;

const ipStore: Map<string, WindowState> =
  g.__venshieldApiIpRateLimit ?? new Map();
g.__venshieldApiIpRateLimit = ipStore;

// ---------------------------------------------------------------------------
// Cleanup interval — removes expired windows from both stores
// ---------------------------------------------------------------------------

const _cleanup = setInterval(() => {
  const cutoff = Date.now() - WINDOW_MS;
  for (const [key, state] of keyStore) {
    if (state.windowStart < cutoff) keyStore.delete(key);
  }
  for (const [key, state] of ipStore) {
    if (state.windowStart < cutoff) ipStore.delete(key);
  }
}, 5 * 60_000);

if (typeof _cleanup === "object" && _cleanup !== null && "unref" in _cleanup) {
  (_cleanup as NodeJS.Timeout).unref();
}

// ---------------------------------------------------------------------------
// IPv6 /64 normalization helpers
// ---------------------------------------------------------------------------

/**
 * Expands a compressed IPv6 address and returns its /64 prefix string.
 * Precondition: ip has already been validated by isIPv6().
 */
function getIPv6Prefix64(ip: string): string {
  // IPv4-mapped or IPv4-compatible IPv6 (e.g. ::ffff:1.2.3.4, ::1.2.3.4)
  // Extract the embedded IPv4 address and treat as a distinct IPv4 host
  if (ip.includes(".")) {
    const lastColon = ip.lastIndexOf(":");
    const embedded = ip.slice(lastColon + 1);
    if (isIPv4(embedded)) return embedded;
    return "0000:0000:0000:0000"; // Malformed — shared fallback bucket
  }

  const halves = ip.split("::");
  if (halves.length > 2) return "0000:0000:0000:0000"; // Should not reach here after isIPv6()

  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  const middle: string[] = Array(missing > 0 ? missing : 0).fill("0000");

  const all = [
    ...left.map((s) => s.padStart(4, "0")),
    ...middle,
    ...right.map((s) => s.padStart(4, "0")),
  ];

  return all.slice(0, 4).join(":") + "::/64";
}

/**
 * Normalizes an IP address string for use as a rate-limit store key.
 * - IPv4: returned as-is (each host is a distinct key)
 * - IPv6: grouped by /64 subnet prefix (prevents per-host rotation within subnet)
 * - Invalid / missing / "unknown": returns "unknown" (applies UNKNOWN_IP_LIMIT)
 */
export function normalizeIp(ip: string): string {
  if (!ip || ip === "unknown") return "unknown";
  if (isIPv4(ip)) return ip;
  if (isIPv6(ip)) return getIPv6Prefix64(ip);
  // Rejects XSS payloads, hostnames, and other non-IP strings
  return "unknown";
}

// ---------------------------------------------------------------------------
// Per-API-key rate limiter (FIFO eviction — IDs are not client-forgeable)
// ---------------------------------------------------------------------------

/**
 * Increments the request counter for `apiKeyId` and returns `true` if the
 * fixed-window limit (100 req/min) has been exceeded.
 */
export function consumeApiKeyRequest(apiKeyId: string): boolean {
  const now = Date.now();
  const existing = keyStore.get(apiKeyId);

  if (!existing || now - existing.windowStart >= WINDOW_MS) {
    // New window — evict oldest entry if at capacity (FIFO)
    if (!keyStore.has(apiKeyId) && keyStore.size >= KEY_MAX_ENTRIES) {
      const oldest = keyStore.keys().next().value;
      if (oldest !== undefined) keyStore.delete(oldest);
    }
    keyStore.set(apiKeyId, { count: 1, windowStart: now });
    return false;
  }

  const next = existing.count + 1;
  keyStore.set(apiKeyId, { count: next, windowStart: existing.windowStart });
  return next > KEY_MAX_REQUESTS;
}

// ---------------------------------------------------------------------------
// Per-IP rate limiter (LRU eviction — active entries are never displaced)
// ---------------------------------------------------------------------------

/**
 * Increments the request counter for the given IP (normalized to /64 for IPv6)
 * and returns `true` if the fixed-window limit has been exceeded.
 *
 * Limits:
 *   - Known IP:    300 req/min
 *   - "unknown":    30 req/min (requests with no identifiable source IP)
 */
export function consumeIpRequest(ip: string): boolean {
  const normalized = normalizeIp(ip);
  const now = Date.now();
  const limit = normalized === "unknown" ? UNKNOWN_IP_LIMIT : IP_MAX_REQUESTS;

  // LRU: delete the existing entry so the re-insert goes to the end of the Map
  // (Map preserves insertion order; first entry = least recently used)
  const existing = ipStore.get(normalized);
  ipStore.delete(normalized);

  let newEntry: WindowState;
  if (!existing || now - existing.windowStart >= WINDOW_MS) {
    // New window
    newEntry = { count: 1, windowStart: now };
  } else {
    newEntry = { count: existing.count + 1, windowStart: existing.windowStart };
  }

  // Evict LRU (first = least recently used) if at capacity
  if (ipStore.size >= IP_MAX_ENTRIES) {
    const firstKey = ipStore.keys().next().value;
    if (firstKey !== undefined) ipStore.delete(firstKey);
  }

  ipStore.set(normalized, newEntry);
  return newEntry.count > limit;
}
