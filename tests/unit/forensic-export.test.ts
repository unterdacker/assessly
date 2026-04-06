/**
 * Unit tests — Forensic Bundle CSV Export Helpers
 *
 * Covers:
 *   - escapeCsvValue: CSV injection prevention (OWASP)
 *   - escapeCsvValue: control-character stripping
 *   - escapeCsvValue: RFC-4180 quoting
 *   - toCsvRows: header-only fallback for empty input
 *   - toCsvRows: full CSV rendering with sanitization applied
 */

import { describe, it, expect, vi } from "vitest";

// Mock server-only transitive dependencies so vitest can import the route module.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/auth/server", () => ({ getAuthSessionFromRequest: vi.fn() }));
vi.mock("@/lib/structured-logger", () => ({ AuditLogger: { log: vi.fn() } }));
vi.mock("@/lib/audit-sanitize", () => ({
  pseudonymizeUserId: vi.fn((id: string) => id),
  scrubPiiFields: vi.fn((x: unknown) => x),
  truncateIp: vi.fn((ip: string) => ip),
  signBundle: vi.fn(() => "sig"),
  computeEventHash: vi.fn(() => "hash"),
}));

import { escapeCsvValue, toCsvRows } from "@/app/api/audit-logs/forensic-bundle/route";

// ---------------------------------------------------------------------------
// escapeCsvValue — CSV injection prevention (OWASP)
// ---------------------------------------------------------------------------

describe("escapeCsvValue — CSV injection prevention", () => {
  it("prefixes a field starting with '=' with a single quote", () => {
    expect(escapeCsvValue("=SUM(A1)")).toBe("'=SUM(A1)");
  });

  it("prefixes a field starting with '+' with a single quote", () => {
    expect(escapeCsvValue("+1-800-555")).toBe("'+1-800-555");
  });

  it("prefixes a field starting with '-' with a single quote", () => {
    expect(escapeCsvValue("-1")).toBe("'-1");
  });

  it("prefixes a field starting with '@' with a single quote", () => {
    expect(escapeCsvValue("@admin")).toBe("'@admin");
  });

  it("prefixes a field starting with a TAB character with a single quote", () => {
    // TAB at start triggers formula neutralization (Step 2).
    // TAB is not a RFC-4180 quoting trigger (Step 3 covers only comma/LF/CR/"), so no wrapping.
    const result = escapeCsvValue("\tDROP TABLE");
    expect(result).toBe("'\tDROP TABLE");
  });

  it("prefixes a field starting with a CR character with a single quote and quotes the field", () => {
    // CR at start triggers formula neutralization; CR in the cell also triggers quoting
    const result = escapeCsvValue("\reval(x)");
    expect(result).toBe("\"'\reval(x)\"");
  });

  it("does NOT prefix a safe field that contains '=' only in mid-string", () => {
    expect(escapeCsvValue("score=100")).toBe("score=100");
  });

  it("does NOT prefix an empty string", () => {
    expect(escapeCsvValue("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// escapeCsvValue — control-character stripping
// ---------------------------------------------------------------------------

describe("escapeCsvValue — control-character stripping", () => {
  it("strips U+0000 (NUL)", () => {
    expect(escapeCsvValue("ab\x00cd")).toBe("abcd");
  });

  it("strips characters in U+0001–U+0008 range", () => {
    expect(escapeCsvValue("\x01\x07")).toBe("");
  });

  it("strips U+000B (VT) and U+000C (FF)", () => {
    expect(escapeCsvValue("a\x0Bb\x0Cc")).toBe("abc");
  });

  it("strips characters in U+000E–U+001F range", () => {
    expect(escapeCsvValue("\x0Etest\x1F")).toBe("test");
  });

  it("preserves TAB (U+0009)", () => {
    // TAB is preserved but prefixed (formula trigger) and quoted
    const result = escapeCsvValue("\tval");
    expect(result).toContain("\t");
  });

  it("preserves LF (U+000A) and wraps the field in double-quotes", () => {
    expect(escapeCsvValue("line1\nline2")).toBe('"line1\nline2"');
  });

  it("strips a leading control char then applies formula-prefix if trigger remains at start", () => {
    // \x01 is stripped, leaving "=SUM(A1)" which must be prefixed
    expect(escapeCsvValue("\x01=SUM(A1)")).toBe("'=SUM(A1)");
  });
});

// ---------------------------------------------------------------------------
// escapeCsvValue — RFC-4180 quoting
// ---------------------------------------------------------------------------

describe("escapeCsvValue — RFC-4180 quoting", () => {
  it("wraps a value containing a comma in double-quotes", () => {
    expect(escapeCsvValue("foo,bar")).toBe('"foo,bar"');
  });

  it("wraps a value containing a double-quote and escapes it as \"\"", () => {
    expect(escapeCsvValue('say "hello"')).toBe('"say ""hello"""');
  });

  it("wraps a value containing a newline in double-quotes", () => {
    expect(escapeCsvValue("line1\nline2")).toBe('"line1\nline2"');
  });

  it("wraps a value containing a CR in double-quotes", () => {
    expect(escapeCsvValue("before\rafter")).toBe('"before\rafter"');
  });

  it("returns a plain value unchanged when no special characters are present", () => {
    expect(escapeCsvValue("hello")).toBe("hello");
  });

  it("combines formula prefix and RFC-4180 quoting when both apply", () => {
    // '=' prefix applied first → "'=foo,bar", then comma triggers quoting
    expect(escapeCsvValue("=foo,bar")).toBe('"\'=foo,bar"');
  });
});

// ---------------------------------------------------------------------------
// toCsvRows
// ---------------------------------------------------------------------------

describe("toCsvRows", () => {
  it("returns the static header line when the rows array is empty", () => {
    expect(toCsvRows([])).toBe(
      "id,timestamp,action,entityType,entityId,eventHash,previousLogHash",
    );
  });

  it("uses the keys of the first row as column headers", () => {
    const result = toCsvRows([{ a: "1", b: "2" }]);
    expect(result.split("\n")[0]).toBe("a,b");
  });

  it("renders a row with plain string values", () => {
    const result = toCsvRows([{ action: "LOGIN", entityId: "u1" }]);
    expect(result.split("\n")[1]).toBe("LOGIN,u1");
  });

  it("renders null/undefined cells as empty strings", () => {
    const result = toCsvRows([{ a: null, b: undefined }]);
    expect(result.split("\n")[1]).toBe(",");
  });

  it("JSON-serializes non-string, non-null values and quotes when necessary", () => {
    const result = toCsvRows([{ meta: { key: "v" } }]);
    // JSON.stringify({key:"v"}) contains double-quotes → must be RFC-4180 quoted
    const cell = result.split("\n")[1];
    expect(cell.startsWith('"')).toBe(true);
    expect(cell).toContain("key");
  });

  it("sanitizes an injection payload in a real row", () => {
    const result = toCsvRows([{ action: "=HYPERLINK(...)", entityId: "normal" }]);
    const cells = result.split("\n")[1].split(",");
    expect(cells[0].startsWith("'=")).toBe(true);
  });
});
