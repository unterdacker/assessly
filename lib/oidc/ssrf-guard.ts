import "server-only";
import * as dns from "dns/promises";
import * as net from "net";

export class OidcSsrfBlockedError extends Error {
  readonly code = "SSRF_BLOCKED" as const;
  readonly issuer: string;

  constructor(issuer: string) {
    super(`SSRF: blocked issuer ${issuer}`);
    this.name = "OidcSsrfBlockedError";
    this.issuer = issuer;
  }
}

function ipv4ToInt(ip: string): number {
  return (
    ip
      .split(".")
      .reduce((acc, octet) => ((acc << 8) | parseInt(octet, 10)) >>> 0, 0) >>> 0
  );
}

interface Ipv4Range {
  base: number;
  mask: number;
}

const BLOCKED_IPV4_RANGES: Ipv4Range[] = [
  { base: ipv4ToInt("0.0.0.0"), mask: 0xff000000 },
  { base: ipv4ToInt("127.0.0.0"), mask: 0xff000000 },
  { base: ipv4ToInt("10.0.0.0"), mask: 0xff000000 },
  { base: ipv4ToInt("172.16.0.0"), mask: 0xfff00000 },
  { base: ipv4ToInt("192.168.0.0"), mask: 0xffff0000 },
  { base: ipv4ToInt("169.254.0.0"), mask: 0xffff0000 },
  { base: ipv4ToInt("100.64.0.0"), mask: 0xffc00000 },
];

function isBlockedIpv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  return BLOCKED_IPV4_RANGES.some(({ base, mask }) => (n & mask) === (base & mask));
}

// BLOCKED_IPV6_PREFIXES uses lowercase string prefix matching.
// Note: dns.resolve6() via c-ares returns canonical compressed forms, so
// startsWith checks on compressed forms are reliable in practice.
const BLOCKED_IPV6_PREFIXES = ["::1", "fc", "fd", "64:ff9b", "2002"];

function isFe80Range(ipLower: string): boolean {
  if (!ipLower.startsWith("fe")) return false;
  const secondByte = parseInt(ipLower.slice(2, 4), 16);
  return Number.isFinite(secondByte) && secondByte >= 0x80 && secondByte <= 0xbf;
}

function isBlockedIpv6(ipLower: string): boolean {
  for (const prefix of BLOCKED_IPV6_PREFIXES) {
    if (ipLower.startsWith(prefix)) return true;
  }
  return isFe80Range(ipLower);
}

function normalizeAndCheckIp(ip: string): boolean {
  // Step 1 - plain IPv4 dotted-quad
  if (net.isIPv4(ip)) return isBlockedIpv4(ip);

  // Step 2 - IPv4-mapped (::ffff:d.d.d.d) or IPv4-compatible (::d.d.d.d) dotted form
  const mDotted = /^::(?:ffff:)?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i.exec(ip);
  if (mDotted) return isBlockedIpv4(mDotted[1]);

  // Step 3 - IPv4-mapped hex form: ::ffff:HHHH:HHHH
  const mMappedHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(ip);
  if (mMappedHex) {
    const a = parseInt(mMappedHex[1].padStart(4, "0"), 16);
    const b = parseInt(mMappedHex[2].padStart(4, "0"), 16);
    return isBlockedIpv4(`${a >> 8}.${a & 0xff}.${b >> 8}.${b & 0xff}`);
  }

  // Step 3.5 - IPv4-translated ::ffff:0:HHHH:HHHH (RFC 6052/7915, SIIT)
  const mTranslated = /^::ffff:0+:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(ip);
  if (mTranslated) {
    const a = parseInt(mTranslated[1].padStart(4, "0"), 16);
    const b = parseInt(mTranslated[2].padStart(4, "0"), 16);
    return isBlockedIpv4(`${a >> 8}.${a & 0xff}.${b >> 8}.${b & 0xff}`);
  }

  // Step 4 - IPv4-compatible hex form: ::HHHH:HHHH (no ffff prefix)
  const mCompatHex = /^::([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(ip);
  if (mCompatHex) {
    const a = parseInt(mCompatHex[1].padStart(4, "0"), 16);
    const b = parseInt(mCompatHex[2].padStart(4, "0"), 16);
    return isBlockedIpv4(`${a >> 8}.${a & 0xff}.${b >> 8}.${b & 0xff}`);
  }

  // Step 5 - 6to4 addresses: 2002:AABB:CCDD:... (encodes IPv4 in bytes 2-5)
  const m6to4 = /^2002:([0-9a-f]{2})([0-9a-f]{2}):([0-9a-f]{2})([0-9a-f]{2}):/i.exec(ip);
  if (m6to4) {
    return isBlockedIpv4(
      `${parseInt(m6to4[1], 16)}.${parseInt(m6to4[2], 16)}.${parseInt(m6to4[3], 16)}.${parseInt(m6to4[4], 16)}`,
    );
  }

  // Step 6 - generic IPv6 checks (fc/fd/::1/64:ff9b/2002 prefixes, fe80::/10)
  if (net.isIPv6(ip)) return isBlockedIpv6(ip.toLowerCase());

  // Step 7 - unknown format: fail closed
  return true;
}

export async function assertSafeHostname(hostname: string, issuer: string): Promise<void> {
  // SECURITY NOTE - DNS rebinding / TOCTOU:
  // We resolve the hostname here and block private IPs, but the actual TCP
  // connection made by openid-client occurs in a separate syscall.
  // An attacker-controlled DNS server with TTL=0 ("DNS rebinding") can return
  // a safe IP for this check and a private IP for the real connection.
  // This guard deflects opportunistic SSRF; it is not a substitute for
  // network-layer egress filtering in production deployments.
  const [v4, v6] = await Promise.all([
    dns.resolve4(hostname).catch((): string[] => []),
    dns.resolve6(hostname).catch((): string[] => []),
  ]);

  const all = [...v4, ...v6];

  if (all.length === 0) throw new OidcSsrfBlockedError(issuer);
  if (all.some(normalizeAndCheckIp)) throw new OidcSsrfBlockedError(issuer);
}

export function createSsrfSafeFetch(
  issuer: string,
): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let hostname: string;
    if (typeof input === "string") {
      hostname = new URL(input).hostname;
    } else if (input instanceof Request) {
      hostname = new URL(input.url).hostname;
    } else {
      hostname = (input as URL).hostname;
    }

    await assertSafeHostname(hostname, issuer);
    return globalThis.fetch(input, init);
  };
}
