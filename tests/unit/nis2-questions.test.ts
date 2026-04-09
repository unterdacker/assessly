import { describe, expect, it } from "vitest";
import {
  NIS2_QUESTIONNAIRE_VERSION,
  categoryKeyMap,
  groupQuestionsByCategory,
  nis2Questions,
} from "@/lib/nis2-questions";

describe("nis2Questions catalog", () => {
  it("contains exactly 20 questions", () => {
    expect(nis2Questions).toHaveLength(20);
  });

  it("has required non-empty fields for each question", () => {
    for (const question of nis2Questions) {
      expect(question.id).toBeTruthy();
      expect(question.category).toBeTruthy();
      expect(question.text).toBeTruthy();
    }
  });
});

describe("categoryKeyMap", () => {
  it("contains q1 through q20 entries", () => {
    expect(Object.keys(categoryKeyMap)).toHaveLength(20);
    for (let i = 1; i <= 20; i += 1) {
      expect(categoryKeyMap[`q${i}`]).toBeTruthy();
    }
  });

  it("maps selected question IDs to expected category keys", () => {
    expect(categoryKeyMap.q1).toBe("governance");
    expect(categoryKeyMap.q4).toBe("access");
    expect(categoryKeyMap.q10).toBe("cryptography");
    expect(categoryKeyMap.q15).toBe("incident");
    expect(categoryKeyMap.q18).toBe("supplyChain");
  });
});

describe("NIS2_QUESTIONNAIRE_VERSION", () => {
  it("is a non-empty string", () => {
    expect(typeof NIS2_QUESTIONNAIRE_VERSION).toBe("string");
    expect(NIS2_QUESTIONNAIRE_VERSION.length).toBeGreaterThan(0);
  });
});

describe("groupQuestionsByCategory", () => {
  it("groups all questions into 7 categories", () => {
    const grouped = groupQuestionsByCategory(nis2Questions);

    expect(Object.keys(grouped)).toHaveLength(7);

    const total = Object.values(grouped).reduce((sum, group) => sum + group.length, 0);
    expect(total).toBe(20);
  });

  it("returns an empty object for an empty input", () => {
    expect(groupQuestionsByCategory([])).toEqual({});
  });

  it("includes every original question in the grouped output", () => {
    const grouped = groupQuestionsByCategory(nis2Questions);
    const groupedIds = new Set(Object.values(grouped).flat().map((q) => q.id));

    for (const question of nis2Questions) {
      expect(groupedIds.has(question.id)).toBe(true);
    }
  });
});
