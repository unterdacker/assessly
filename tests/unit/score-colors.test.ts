import { describe, expect, it } from "vitest";
import { scoreBand, scoreGaugeColor, scoreGaugeStroke } from "@/lib/score-colors";

describe("scoreBand", () => {
  it("maps boundary values to the expected risk band", () => {
    expect(scoreBand(0)).toBe("high");
    expect(scoreBand(39)).toBe("high");
    expect(scoreBand(40)).toBe("medium");
    expect(scoreBand(70)).toBe("medium");
    expect(scoreBand(71)).toBe("low");
    expect(scoreBand(100)).toBe("low");
  });
});

describe("scoreGaugeColor", () => {
  it("returns red for high-risk band", () => {
    expect(scoreGaugeColor(10)).toBe("text-red-600 dark:text-red-400");
  });

  it("returns amber for medium-risk band", () => {
    expect(scoreGaugeColor(50)).toBe("text-amber-600 dark:text-amber-400");
  });

  it("returns emerald for low-risk band", () => {
    expect(scoreGaugeColor(90)).toBe("text-emerald-600 dark:text-emerald-400");
  });
});

describe("scoreGaugeStroke", () => {
  it("returns red stroke for high-risk band", () => {
    expect(scoreGaugeStroke(10)).toBe("#dc2626");
  });

  it("returns amber stroke for medium-risk band", () => {
    expect(scoreGaugeStroke(50)).toBe("#d97706");
  });

  it("returns green stroke for low-risk band", () => {
    expect(scoreGaugeStroke(90)).toBe("#059669");
  });
});
