import { describe, expect, it } from "vitest";
import { FIELD_LABELS, formatFieldValue, getFieldLabel } from "@/lib/audit-field-labels";

describe("getFieldLabel", () => {
  it("returns mapped labels for known fields", () => {
    expect(getFieldLabel("status")).toBe("Status");
    expect(getFieldLabel("findings")).toBe("Findings");
  });

  it("falls back to identity for unknown fields", () => {
    expect(getFieldLabel("unknownField")).toBe("unknownField");
  });

  it("maps every FIELD_LABELS key correctly", () => {
    for (const [key, value] of Object.entries(FIELD_LABELS)) {
      expect(getFieldLabel(key)).toBe(value);
    }
  });
});

describe("formatFieldValue", () => {
  it("formats null and undefined as em dash", () => {
    expect(formatFieldValue(null)).toBe("—");
    expect(formatFieldValue(undefined)).toBe("—");
  });

  it("formats booleans as Yes/No", () => {
    expect(formatFieldValue(true)).toBe("Yes");
    expect(formatFieldValue(false)).toBe("No");
  });

  it("returns short strings unchanged", () => {
    expect(formatFieldValue("短string")).toBe("短string");
  });

  it("truncates long strings over 100 characters", () => {
    const out = formatFieldValue("x".repeat(101));
    expect(out.endsWith("...")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(103);
  });

  it("serializes plain objects to JSON", () => {
    expect(formatFieldValue({ key: "val" })).toContain('"key": "val"');
  });

  it("stringifies numbers", () => {
    expect(formatFieldValue(42)).toBe("42");
  });

  it("falls back to String(value) for circular objects", () => {
    const o: { self?: unknown } = {};
    o.self = o;

    expect(formatFieldValue(o)).toBe("[object Object]");
  });

  it("truncates long serialized JSON values over 200 characters", () => {
    const out = formatFieldValue({ big: "x".repeat(210) });
    expect(out.endsWith("...")).toBe(true);
  });
});
