import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("merges plain class names", () => {
    expect(cn("p-4", "text-sm", "font-medium")).toBe("p-4 text-sm font-medium");
  });

  it("deduplicates conflicting Tailwind utility classes", () => {
    expect(cn("p-4", "p-8")).toBe("p-8");
  });

  it("supports conditional object syntax", () => {
    expect(cn("base", { hidden: false, block: true }, { "mt-2": true })).toBe("base block mt-2");
  });

  it("returns an empty string when called without inputs", () => {
    expect(cn()).toBe("");
  });
});
