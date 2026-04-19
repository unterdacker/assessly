import { describe, expect, it } from "vitest";
import {
  detectRegression,
  calculateOverallScore,
} from "@/modules/continuous-monitoring/lib/regression-detection";
import {
  calculateNextDueDate,
  getIntervalLabel,
  getIntervalDays,
} from "@/modules/continuous-monitoring/lib/next-due-calculator";

describe("detectRegression", () => {
  it("detects regression when category drops by exactly threshold amount", () => {
    const previousScores = { governance: 80 };
    const currentScores = { governance: 70 };
    const threshold = 10;

    const result = detectRegression(previousScores, currentScores, threshold);

    expect(result).toEqual(["governance"]);
  });

  it("detects regression when category drops by more than threshold", () => {
    const previousScores = { governance: 90 };
    const currentScores = { governance: 70 };
    const threshold = 10;

    const result = detectRegression(previousScores, currentScores, threshold);

    expect(result).toEqual(["governance"]);
  });

  it("does NOT detect regression when drop is less than threshold", () => {
    const previousScores = { governance: 80 };
    const currentScores = { governance: 75 };
    const threshold = 10;

    const result = detectRegression(previousScores, currentScores, threshold);

    expect(result).toEqual([]);
  });

  it("returns empty when no previous scores to compare", () => {
    const previousScores = {};
    const currentScores = { governance: 75 };
    const threshold = 10;

    const result = detectRegression(previousScores, currentScores, threshold);

    expect(result).toEqual([]);
  });

  it("detects regression in only affected categories", () => {
    const previousScores = {
      governance: 90,
      access: 85,
    };
    const currentScores = {
      governance: 70,
      access: 84,
    };
    const threshold = 10;

    const result = detectRegression(previousScores, currentScores, threshold);

    expect(result).toEqual(["governance"]);
  });

  it("handles improvement (score increase) correctly", () => {
    const previousScores = { governance: 70 };
    const currentScores = { governance: 80 };
    const threshold = 10;

    const result = detectRegression(previousScores, currentScores, threshold);

    expect(result).toEqual([]);
  });

  it("detects regression in multiple categories", () => {
    const previousScores = {
      governance: 90,
      access: 85,
      encryption: 80,
    };
    const currentScores = {
      governance: 70,
      access: 65,
      encryption: 75,
    };
    const threshold = 10;

    const result = detectRegression(previousScores, currentScores, threshold);

    expect(result).toEqual(["governance", "access"]);
  });

  it("ignores categories only present in current scores", () => {
    const previousScores = {
      governance: 90,
    };
    const currentScores = {
      governance: 85,
      newCategory: 50,
    };
    const threshold = 10;

    const result = detectRegression(previousScores, currentScores, threshold);

    expect(result).toEqual([]);
  });

  it("handles edge case with threshold of 1", () => {
    const previousScores = { governance: 80 };
    const currentScores = { governance: 79 };
    const threshold = 1;

    const result = detectRegression(previousScores, currentScores, threshold);

    expect(result).toEqual(["governance"]);
  });

  it("handles edge case with threshold of 100", () => {
    const previousScores = { governance: 100 };
    const currentScores = { governance: 0 };
    const threshold = 100;

    const result = detectRegression(previousScores, currentScores, threshold);

    expect(result).toEqual(["governance"]);
  });
});

describe("calculateOverallScore", () => {
  it("calculates average of category scores", () => {
    const categoryScores = {
      governance: 80,
      access: 90,
      encryption: 70,
    };

    const result = calculateOverallScore(categoryScores);

    expect(result).toBe(80);
  });

  it("returns 0 for empty category scores", () => {
    const categoryScores = {};

    const result = calculateOverallScore(categoryScores);

    expect(result).toBe(0);
  });

  it("handles single category", () => {
    const categoryScores = {
      governance: 85,
    };

    const result = calculateOverallScore(categoryScores);

    expect(result).toBe(85);
  });

  it("rounds to 2 decimal places", () => {
    const categoryScores = {
      governance: 80,
      access: 85,
      encryption: 90,
    };

    const result = calculateOverallScore(categoryScores);

    expect(result).toBe(85);
  });

  it("handles fractional scores correctly", () => {
    const categoryScores = {
      governance: 83.33,
      access: 86.67,
    };

    const result = calculateOverallScore(categoryScores);

    expect(result).toBe(85);
  });
});

describe("calculateNextDueDate", () => {
  it("MONTHLY advances by 1 month", () => {
    const fromDate = new Date("2026-04-15T00:00:00Z");
    const result = calculateNextDueDate("MONTHLY", fromDate);

    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(4); // May (0-indexed)
    expect(result.getDate()).toBe(15);
  });

  it("QUARTERLY advances by 3 months", () => {
    const fromDate = new Date("2026-04-15T00:00:00Z");
    const result = calculateNextDueDate("QUARTERLY", fromDate);

    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(6); // July (0-indexed)
    expect(result.getDate()).toBe(15);
  });

  it("SEMI_ANNUAL advances by 6 months", () => {
    const fromDate = new Date("2026-04-15T00:00:00Z");
    const result = calculateNextDueDate("SEMI_ANNUAL", fromDate);

    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(9); // October (0-indexed)
    expect(result.getDate()).toBe(15);
  });

  it("ANNUAL advances by 12 months", () => {
    const fromDate = new Date("2026-04-15T00:00:00Z");
    const result = calculateNextDueDate("ANNUAL", fromDate);

    expect(result.getFullYear()).toBe(2027);
    expect(result.getMonth()).toBe(3); // April (0-indexed)
    expect(result.getDate()).toBe(15);
  });

  it("handles month rollover correctly (MONTHLY)", () => {
    const fromDate = new Date("2026-12-15T00:00:00Z");
    const result = calculateNextDueDate("MONTHLY", fromDate);

    expect(result.getFullYear()).toBe(2027);
    expect(result.getMonth()).toBe(0); // January
    expect(result.getDate()).toBe(15);
  });

  it("handles year boundary correctly (QUARTERLY)", () => {
    const fromDate = new Date("2026-11-15T00:00:00Z");
    const result = calculateNextDueDate("QUARTERLY", fromDate);

    expect(result.getFullYear()).toBe(2027);
    expect(result.getMonth()).toBe(1); // February
    expect(result.getDate()).toBe(15);
  });

  it("handles leap year correctly (ANNUAL)", () => {
    const fromDate = new Date("2024-02-29T00:00:00Z");
    const result = calculateNextDueDate("ANNUAL", fromDate);

    expect(result.getFullYear()).toBe(2025);
    // Note: Feb 29 doesn't exist in 2025, so JavaScript adjusts to March 1
    expect(result.getMonth()).toBe(2); // March (0-indexed)
    expect(result.getDate()).toBe(1);
  });

  it("preserves time portion of the date", () => {
    const fromDate = new Date("2026-04-15T14:30:45.123Z");
    const result = calculateNextDueDate("MONTHLY", fromDate);

    // Time should be preserved (though it may shift by timezone)
    expect(result.getUTCHours()).toBe(14);
    expect(result.getUTCMinutes()).toBe(30);
    expect(result.getUTCSeconds()).toBe(45);
    expect(result.getUTCMilliseconds()).toBe(123);
  });

  it("does not mutate the original date", () => {
    const fromDate = new Date("2026-04-15T00:00:00Z");
    const originalTime = fromDate.getTime();
    
    calculateNextDueDate("MONTHLY", fromDate);

    expect(fromDate.getTime()).toBe(originalTime);
  });
});

describe("getIntervalLabel", () => {
  it("returns correct label for MONTHLY", () => {
    expect(getIntervalLabel("MONTHLY")).toBe("Monthly");
  });

  it("returns correct label for QUARTERLY", () => {
    expect(getIntervalLabel("QUARTERLY")).toBe("Quarterly");
  });

  it("returns correct label for SEMI_ANNUAL", () => {
    expect(getIntervalLabel("SEMI_ANNUAL")).toBe("Semi-Annual");
  });

  it("returns correct label for ANNUAL", () => {
    expect(getIntervalLabel("ANNUAL")).toBe("Annual");
  });
});

describe("getIntervalDays", () => {
  it("returns 30 days for MONTHLY", () => {
    expect(getIntervalDays("MONTHLY")).toBe(30);
  });

  it("returns 90 days for QUARTERLY", () => {
    expect(getIntervalDays("QUARTERLY")).toBe(90);
  });

  it("returns 180 days for SEMI_ANNUAL", () => {
    expect(getIntervalDays("SEMI_ANNUAL")).toBe(180);
  });

  it("returns 365 days for ANNUAL", () => {
    expect(getIntervalDays("ANNUAL")).toBe(365);
  });
});
