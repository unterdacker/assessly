import "server-only";
import * as net from "net";
import * as dns from "dns/promises";

const BLOCKED_IPV4_RANGES: Array<{ base: number; mask: number }> = [
  { base: ipv4ToInt("127.0.0.0"), mask: 0xff000000 },
  { base: ipv4ToInt("10.0.0.0"), mask: 0xff000000 },
  { base: ipv4ToInt("172.16.0.0"), mask: 0xfff00000 },
  { base: ipv4ToInt("192.168.0.0"), mask: 0xffff0000 },
  { base: ipv4ToInt("169.254.0.0"), mask: 0xffff0000 },
  { base: ipv4ToInt("100.64.0.0"), mask: 0xffc00000 },
];

const BLOCKED_IPV6_PREFIXES = ["::1", "fc", "fd"];

export class OidcSsrfBlockedError extends Error {
  readonly code = "SSRF_BLOCKED" as const;

  constructor(readonly issuer: string) {
    super(`SSRF: blocked issuer ${issuer}`);
  }
}

function ipv4ToInt(ip: string): number {
  return (
    ip
      .split(".")
      .reduce((acc, octet) => (acc << 8) | parseInt(octet, 10), 0) >>> 0
  );
}

function isBlockedIpv4(ip: string): boolean {
  const n = ipv4ToInt(ip) >>> 0;
  return BLOCKED_IPV4_RANGES.some(({ base, mask }) => (n & mask) === (base & mask));
}

function isBlockedIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  return isFe80Range(lower) || BLOCKED_IPV6_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

function isFe80Range(ipLower: string): boolean {
  if (!ipLower.startsWith("fe")) return false;
  const secondByte = parseInt(ipLower.slice(2, 4), 16);
  return Number.isFinite(secondByte) && secondByte >= 0x80 && secondByte <= 0xbf;
}

function normalizeAndCheckIp(ip: string): boolean {
  const ipv4Mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (ipv4Mapped) {
    return isBlockedIpv4(ipv4Mapped[1]);
  }
  if (net.isIPv4(ip)) return isBlockedIpv4(ip);
  if (net.isIPv6(ip)) return isBlockedIpv6(ip);
  return true;
}

export async function assertSafeHostname(hostname: string, issuerUrl: string): Promise<void> {
  const addrs: string[] = [];

  try {
    const v4 = await dns.resolve4(hostname).catch(() => []);
    const v6 = await dns.resolve6(hostname).catch(() => []);
    addrs.push(...v4, ...v6);
  } catch {
    throw new OidcSsrfBlockedError(issuerUrl);
  }

  if (addrs.length === 0) throw new OidcSsrfBlockedError(issuerUrl);

  for (const addr of addrs) {
    if (normalizeAndCheckIp(addr)) throw new OidcSsrfBlockedError(issuerUrl);
  }
}

export function createSsrfSafeFetch(issuerUrl: string): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const urlString = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const parsed = new URL(urlString);
    await assertSafeHostname(parsed.hostname, issuerUrl);
    return fetch(input, init);
  };
}
