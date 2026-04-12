import { describe, expect, it } from "vitest";
import { parseRfc4180 } from "@/lib/csv-parse";

describe("parseRfc4180", () => {
  it("returns an empty array for empty content", () => {
    expect(parseRfc4180("")).toEqual([]);
  });

  it("parses unquoted rows and trims unquoted field whitespace", () => {
    expect(parseRfc4180(" a ,b \n c,d ")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("preserves whitespace inside quoted fields", () => {
    expect(parseRfc4180('"  keep  ",x')).toEqual([["  keep  ", "x"]]);
  });

  it("parses escaped quotes in quoted fields", () => {
    expect(parseRfc4180('"say ""hi""",ok')).toEqual([["say \"hi\"", "ok"]]);
  });

  it("handles CRLF line endings", () => {
    expect(parseRfc4180("a,b\r\nc,d\r\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("keeps __proto__ as a literal field value", () => {
    const result = parseRfc4180("__proto__\n");
    expect(result).toEqual([["__proto__"]]);
    expect(result[0][0]).toBe("__proto__");
  });

  it("throws for unexpected characters after a closing quote", () => {
    expect(() => parseRfc4180('"abc"x')).toThrow("Invalid CSV: unexpected character after closing quote.");
  });

  it("throws for unterminated quoted fields", () => {
    expect(() => parseRfc4180('"abc')).toThrow("Invalid CSV: unterminated quoted field.");
  });
});
