import { describe, expect, it } from "vitest";
import {
  CreateTemplateSchema,
  UpdateTemplateSchema,
  DuplicateTemplateSchema,
  DeleteTemplateSchema,
  CreateSectionSchema,
  UpdateSectionSchema,
  ReorderSectionsSchema,
  DeleteSectionSchema,
  CreateQuestionSchema,
  UpdateQuestionSchema,
  ReorderQuestionsSchema,
  DeleteQuestionSchema,
  ImportTemplateSchema,
  LIMITS,
} from "@/modules/questionnaire-builder/lib/validation";

describe("CreateTemplateSchema", () => {
  it("accepts valid name and description", () => {
    const result = CreateTemplateSchema.safeParse({
      name: "My Template",
      description: "A description",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = CreateTemplateSchema.safeParse({
      name: "",
      description: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects name exceeding MAX_TEMPLATE_NAME_LENGTH (200 chars)", () => {
    const result = CreateTemplateSchema.safeParse({
      name: "x".repeat(LIMITS.MAX_TEMPLATE_NAME_LENGTH + 1),
      description: null,
    });
    expect(result.success).toBe(false);
  });

  it("accepts null description", () => {
    const result = CreateTemplateSchema.safeParse({
      name: "Template",
      description: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts missing description (optional)", () => {
    const result = CreateTemplateSchema.safeParse({
      name: "Template",
    });
    expect(result.success).toBe(true);
  });

  it("rejects description exceeding MAX_DESCRIPTION_LENGTH (2000 chars)", () => {
    const result = CreateTemplateSchema.safeParse({
      name: "Template",
      description: "x".repeat(LIMITS.MAX_DESCRIPTION_LENGTH + 1),
    });
    expect(result.success).toBe(false);
  });
});

describe("UpdateTemplateSchema", () => {
  it("accepts partial update with just id and name", () => {
    const result = UpdateTemplateSchema.safeParse({
      id: "clx0987654321zyxwvutsrq",
      name: "Updated Name",
    });
    expect(result.success).toBe(true);
  });

  it("accepts updating isActive to false", () => {
    const result = UpdateTemplateSchema.safeParse({
      id: "clx0987654321zyxwvutsrq",
      isActive: false,
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing id", () => {
    const result = UpdateTemplateSchema.safeParse({
      name: "Name",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-cuid id", () => {
    const result = UpdateTemplateSchema.safeParse({
      id: "not-a-cuid",
      name: "Name",
    });
    expect(result.success).toBe(false);
  });
});

describe("CreateSectionSchema", () => {
  it("accepts valid templateId and title", () => {
    const result = CreateSectionSchema.safeParse({
      templateId: "clx0987654321zyxwvutsrq",
      title: "Section Title",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty title", () => {
    const result = CreateSectionSchema.safeParse({
      templateId: "clx0987654321zyxwvutsrq",
      title: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-cuid templateId", () => {
    const result = CreateSectionSchema.safeParse({
      templateId: "not-a-cuid",
      title: "Section Title",
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional description", () => {
    const result = CreateSectionSchema.safeParse({
      templateId: "clx0987654321zyxwvutsrq",
      title: "Section Title",
      description: "Optional description",
    });
    expect(result.success).toBe(true);
  });
});

describe("ReorderSectionsSchema", () => {
  it("accepts valid templateId with sectionIds array", () => {
    const result = ReorderSectionsSchema.safeParse({
      templateId: "clx0987654321zyxwvutsrq",
      sectionIds: ["clxsec1000000000001", "clxsec2000000000002"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty sectionIds array", () => {
    const result = ReorderSectionsSchema.safeParse({
      templateId: "clx0987654321zyxwvutsrq",
      sectionIds: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-cuid templateId", () => {
    const result = ReorderSectionsSchema.safeParse({
      templateId: "not-a-cuid",
      sectionIds: ["clxsec1000000000001"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-cuid entry in sectionIds", () => {
    const result = ReorderSectionsSchema.safeParse({
      templateId: "clx0987654321zyxwvutsrq",
      sectionIds: ["not-a-cuid"],
    });
    expect(result.success).toBe(false);
  });
});

describe("CreateQuestionSchema - type validation", () => {
  it("accepts BOOLEAN type with no options and no scale values", () => {
    const result = CreateQuestionSchema.safeParse({
      sectionId: "clx0987654321zyxwvutsrq",
      text: "Is this correct?",
      type: "BOOLEAN",
      isRequired: true,
      options: null,
      scaleMin: null,
      scaleMax: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects BOOLEAN type with options provided", () => {
    const result = CreateQuestionSchema.safeParse({
      sectionId: "clx0987654321zyxwvutsrq",
      text: "Is this correct?",
      type: "BOOLEAN",
      isRequired: true,
      options: ["Yes", "No"],
      scaleMin: null,
      scaleMax: null,
    });
    expect(result.success).toBe(false);
  });

  it("accepts SINGLE_CHOICE with at least 2 options", () => {
    const result = CreateQuestionSchema.safeParse({
      sectionId: "clx0987654321zyxwvutsrq",
      text: "Choose one",
      type: "SINGLE_CHOICE",
      isRequired: true,
      options: ["Option A", "Option B"],
      scaleMin: null,
      scaleMax: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects SINGLE_CHOICE with only 1 option", () => {
    const result = CreateQuestionSchema.safeParse({
      sectionId: "clx0987654321zyxwvutsrq",
      text: "Choose one",
      type: "SINGLE_CHOICE",
      isRequired: true,
      options: ["Only One"],
      scaleMin: null,
      scaleMax: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects SINGLE_CHOICE with null options", () => {
    const result = CreateQuestionSchema.safeParse({
      sectionId: "clx0987654321zyxwvutsrq",
      text: "Choose one",
      type: "SINGLE_CHOICE",
      isRequired: true,
      options: null,
      scaleMin: null,
      scaleMax: null,
    });
    expect(result.success).toBe(false);
  });

  it("accepts MULTI_CHOICE with at least 2 options", () => {
    const result = CreateQuestionSchema.safeParse({
      sectionId: "clx0987654321zyxwvutsrq",
      text: "Choose multiple",
      type: "MULTI_CHOICE",
      isRequired: false,
      options: ["Option A", "Option B", "Option C"],
      scaleMin: null,
      scaleMax: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts SCALE type with valid scaleMin < scaleMax", () => {
    const result = CreateQuestionSchema.safeParse({
      sectionId: "clx0987654321zyxwvutsrq",
      text: "Rate from 1 to 10",
      type: "SCALE",
      isRequired: true,
      options: null,
      scaleMin: 1,
      scaleMax: 10,
    });
    expect(result.success).toBe(true);
  });

  it("rejects SCALE type where scaleMin equals scaleMax", () => {
    const result = CreateQuestionSchema.safeParse({
      sectionId: "clx0987654321zyxwvutsrq",
      text: "Rate",
      type: "SCALE",
      isRequired: true,
      options: null,
      scaleMin: 5,
      scaleMax: 5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects SCALE type where scaleMin > scaleMax", () => {
    const result = CreateQuestionSchema.safeParse({
      sectionId: "clx0987654321zyxwvutsrq",
      text: "Rate",
      type: "SCALE",
      isRequired: true,
      options: null,
      scaleMin: 10,
      scaleMax: 1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects SCALE type without scaleMax (null)", () => {
    const result = CreateQuestionSchema.safeParse({
      sectionId: "clx0987654321zyxwvutsrq",
      text: "Rate",
      type: "SCALE",
      isRequired: true,
      options: null,
      scaleMin: 1,
      scaleMax: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects TEXT type with scale values provided", () => {
    const result = CreateQuestionSchema.safeParse({
      sectionId: "clx0987654321zyxwvutsrq",
      text: "Describe",
      type: "TEXT",
      isRequired: false,
      options: null,
      scaleMin: 1,
      scaleMax: 10,
    });
    expect(result.success).toBe(false);
  });

  it("accepts FILE_UPLOAD type with no options or scale", () => {
    const result = CreateQuestionSchema.safeParse({
      sectionId: "clx0987654321zyxwvutsrq",
      text: "Upload file",
      type: "FILE_UPLOAD",
      isRequired: false,
      options: null,
      scaleMin: null,
      scaleMax: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects prototype poisoning key __proto__ as an option value", () => {
    const result = CreateQuestionSchema.safeParse({
      sectionId: "clx0987654321zyxwvutsrq",
      text: "Choose one",
      type: "SINGLE_CHOICE",
      isRequired: true,
      options: ["Option A", "__proto__"],
      scaleMin: null,
      scaleMax: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects prototype poisoning key constructor as an option value", () => {
    const result = CreateQuestionSchema.safeParse({
      sectionId: "clx0987654321zyxwvutsrq",
      text: "Choose one",
      type: "SINGLE_CHOICE",
      isRequired: true,
      options: ["constructor", "Option B"],
      scaleMin: null,
      scaleMax: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects prototype poisoning key prototype as an option value", () => {
    const result = CreateQuestionSchema.safeParse({
      sectionId: "clx0987654321zyxwvutsrq",
      text: "Choose one",
      type: "SINGLE_CHOICE",
      isRequired: true,
      options: ["Option A", "prototype"],
      scaleMin: null,
      scaleMax: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects question text exceeding MAX_QUESTION_TEXT_LENGTH (1000 chars)", () => {
    const result = CreateQuestionSchema.safeParse({
      sectionId: "clx0987654321zyxwvutsrq",
      text: "x".repeat(LIMITS.MAX_QUESTION_TEXT_LENGTH + 1),
      type: "TEXT",
      isRequired: false,
      options: null,
      scaleMin: null,
      scaleMax: null,
    });
    expect(result.success).toBe(false);
  });
});

describe("UpdateQuestionSchema", () => {
  it("accepts partial update with id and text", () => {
    const result = UpdateQuestionSchema.safeParse({
      id: "clx0987654321zyxwvutsrq",
      text: "Updated question text",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing id", () => {
    const result = UpdateQuestionSchema.safeParse({
      text: "Text",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-cuid id", () => {
    const result = UpdateQuestionSchema.safeParse({
      id: "not-a-cuid",
      text: "Text",
    });
    expect(result.success).toBe(false);
  });
});

describe("ReorderQuestionsSchema", () => {
  it("accepts valid sectionId with questionIds", () => {
    const result = ReorderQuestionsSchema.safeParse({
      sectionId: "clx0987654321zyxwvutsrq",
      questionIds: ["clxq1000000000000001", "clxq2000000000000002"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty questionIds array", () => {
    const result = ReorderQuestionsSchema.safeParse({
      sectionId: "clx0987654321zyxwvutsrq",
      questionIds: [],
    });
    expect(result.success).toBe(false);
  });
});

describe("ImportTemplateSchema", () => {
  it("accepts a minimal valid template with one section and one boolean question", () => {
    const result = ImportTemplateSchema.safeParse({
      name: "Imported Template",
      description: null,
      sections: [
        {
          title: "Section 1",
          description: null,
          questions: [
            {
              text: "Question 1",
              type: "BOOLEAN",
              isRequired: true,
              options: null,
              scaleMin: null,
              scaleMax: null,
            },
          ],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts template with SCALE question having min and max", () => {
    const result = ImportTemplateSchema.safeParse({
      name: "Template with Scale",
      description: null,
      sections: [
        {
          title: "Section 1",
          description: null,
          questions: [
            {
              text: "Rate this",
              type: "SCALE",
              isRequired: false,
              options: null,
              scaleMin: 1,
              scaleMax: 5,
            },
          ],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts template with SINGLE_CHOICE question with 2 options", () => {
    const result = ImportTemplateSchema.safeParse({
      name: "Template with Choice",
      description: null,
      sections: [
        {
          title: "Section 1",
          description: null,
          questions: [
            {
              text: "Choose one",
              type: "SINGLE_CHOICE",
              isRequired: true,
              options: ["Option A", "Option B"],
              scaleMin: null,
              scaleMax: null,
            },
          ],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects template with unknown top-level field (strict mode)", () => {
    const result = ImportTemplateSchema.safeParse({
      name: "Template",
      description: null,
      sections: [],
      unknownField: "value",
    });
    expect(result.success).toBe(false);
  });

  it("rejects section with unknown field (strict mode)", () => {
    const result = ImportTemplateSchema.safeParse({
      name: "Template",
      description: null,
      sections: [
        {
          title: "Section 1",
          description: null,
          questions: [],
          unknownField: "value",
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects question with unknown field (strict mode)", () => {
    const result = ImportTemplateSchema.safeParse({
      name: "Template",
      description: null,
      sections: [
        {
          title: "Section 1",
          description: null,
          questions: [
            {
              text: "Question 1",
              type: "TEXT",
              isRequired: false,
              options: null,
              scaleMin: null,
              scaleMax: null,
              unknownField: "value",
            },
          ],
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects template with missing name", () => {
    const result = ImportTemplateSchema.safeParse({
      description: null,
      sections: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects template where sections array exceeds MAX_SECTIONS_PER_TEMPLATE", () => {
    const sections = Array.from(
      { length: LIMITS.MAX_SECTIONS_PER_TEMPLATE + 1 },
      (_, i) => ({
        title: `Section ${i + 1}`,
        description: null,
        questions: [],
      })
    );
    const result = ImportTemplateSchema.safeParse({
      name: "Template",
      description: null,
      sections,
    });
    expect(result.success).toBe(false);
  });

  it("rejects section where questions array exceeds MAX_QUESTIONS_PER_SECTION", () => {
    const questions = Array.from(
      { length: LIMITS.MAX_QUESTIONS_PER_SECTION + 1 },
      (_, i) => ({
        text: `Question ${i + 1}`,
        type: "TEXT",
        isRequired: false,
        options: null,
        scaleMin: null,
        scaleMax: null,
      })
    );
    const result = ImportTemplateSchema.safeParse({
      name: "Template",
      description: null,
      sections: [
        {
          title: "Section 1",
          description: null,
          questions,
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects BOOLEAN question in import with options provided", () => {
    const result = ImportTemplateSchema.safeParse({
      name: "Template",
      description: null,
      sections: [
        {
          title: "Section 1",
          description: null,
          questions: [
            {
              text: "Question 1",
              type: "BOOLEAN",
              isRequired: true,
              options: ["Yes", "No"],
              scaleMin: null,
              scaleMax: null,
            },
          ],
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects section where title exceeds MAX_SECTION_TITLE_LENGTH", () => {
    const result = ImportTemplateSchema.safeParse({
      name: "Template",
      description: null,
      sections: [
        {
          title: "x".repeat(LIMITS.MAX_SECTION_TITLE_LENGTH + 1),
          description: null,
          questions: [],
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});
