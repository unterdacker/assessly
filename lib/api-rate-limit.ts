/**
 * lib/api-rate-limit.ts
 *
 * Fixed-window request counter for API key rate limiting.
 * Separate from lib/rate-limit.ts (consecutive-failure blocker used for auth).
 *
 * SINGLE-REPLICA NOTE: State is in-process. In multi-replica deployments the
 * effective limit multiplies by replica count. For production horizontal scale,
 * replace with Redis INCR+EXPIRE sliding window.
 *
 * NOT safe for Edge Runtime. Do not import in middleware.ts.
 */

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 100;
const MAX_ENTRIES = 50_000;

type WindowState = {
  count: number;
  windowStart: number; // epoch ms
};

const g = globalThis as typeof globalThis & {
  __venshieldApiRateLimit?: Map<string, WindowState>;
};
const store: Map<string, WindowState> =
  g.__venshieldApiRateLimit ?? new Map<string, WindowState>();
g.__venshieldApiRateLimit = store;

const _cleanup = setInterval(() => {
  const cutoff = Date.now() - WINDOW_MS;
  for (const [key, state] of store) {
    if (state.windowStart < cutoff) store.delete(key);
  }
}, 5 * 60_000);

if (typeof _cleanup === "object" && _cleanup !== null && "unref" in _cleanup) {
  (_cleanup as NodeJS.Timeout).unref();
}

/**
 * Returns true if the apiKeyId has exceeded the rate limit for the current window.
 * Increments the counter as a side-effect.
 */
export function consumeApiKeyRequest(apiKeyId: string): boolean {
  const now = Date.now();
  const existing = store.get(apiKeyId);

  if (!existing || now - existing.windowStart >= WINDOW_MS) {
    // Evict oldest entry if at capacity
    if (!store.has(apiKeyId) && store.size >= MAX_ENTRIES) {
      const oldest = store.keys().next().value;
      if (oldest !== undefined) store.delete(oldest);
    }
    store.set(apiKeyId, { count: 1, windowStart: now });
    return false;
  }

  const next = existing.count + 1;
  store.set(apiKeyId, { count: next, windowStart: existing.windowStart });
  return next > MAX_REQUESTS_PER_WINDOW;
}
