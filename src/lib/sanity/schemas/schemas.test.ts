import { describe, it, expect } from "vitest";
import { schemaTypes } from "./index";

function fieldsFor(name: string) {
  const schema = schemaTypes.find((s) => s.name === name) as
    | {
        fields?: SchemaField[];
      }
    | undefined;
  return schema?.fields ?? [];
}

type SchemaField = {
  name: string;
  type: string;
  validation?: unknown;
  options?: { hotspot?: boolean };
  of?: SchemaField[];
  to?: { type: string }[];
  fields?: SchemaField[];
};

/** Invokes a field's `validation` with a recording rule to see if it calls
 *  `.required()` — i.e. whether the field (or nested alt) is mandatory. */
function isRequired(field: SchemaField | undefined): boolean {
  let requiredCalled = false;
  const rule: Record<string, () => unknown> = {};
  for (const method of ["required", "min", "max", "uri", "unique", "custom"]) {
    rule[method] = () => {
      if (method === "required") requiredCalled = true;
      return rule;
    };
  }
  if (typeof field?.validation === "function") {
    (field.validation as (r: unknown) => unknown)(rule);
  }
  return requiredCalled;
}

type CustomValidator = (values: unknown) => true | string;

type FakeRule = {
  required: () => FakeRule;
  min: () => FakeRule;
  max: () => FakeRule;
  uri: () => FakeRule;
  unique: () => FakeRule;
  custom: (validator: CustomValidator) => FakeRule;
};

function customValidatorFor(schemaName: string, fieldName: string) {
  const validation = fieldsFor(schemaName).find(
    (field) => field.name === fieldName,
  )?.validation;
  expect(validation).toBeTypeOf("function");

  let customValidator: CustomValidator | undefined;
  const rule: FakeRule = {
    required: () => rule,
    min: () => rule,
    max: () => rule,
    uri: () => rule,
    unique: () => rule,
    custom: (validator) => {
      customValidator = validator;
      return rule;
    },
  };

  (validation as (rule: FakeRule) => unknown)(rule);
  expect(customValidator).toBeTypeOf("function");
  return customValidator;
}

describe("sanity schemas", () => {
  it("exports all expected schema types", () => {
    const names = schemaTypes.map((s) => s.name);
    expect(names).toContain("portableText");
    expect(names).toContain("gallery");
    expect(names).toContain("socialLink");
    expect(names).toContain("faq");
    expect(names).toContain("testimonial");
    expect(names).toContain("film");
    expect(names).toContain("filmCollection");
    expect(names).toContain("filmsPageSettings");
    expect(names).toContain("academyPageSettings");
    expect(names).toContain("program");
    expect(names).toContain("teamMember");
    expect(names).toContain("partner");
    expect(names).toContain("homepageVideo");
  });

  it("has 13 total schema types (5 objects + 8 documents)", () => {
    expect(schemaTypes).toHaveLength(13);
  });

  it("homepageVideo schema has a title, youtube id and sort order", () => {
    const video = schemaTypes.find((s) => s.name === "homepageVideo");
    expect(video?.type).toBe("document");
    expect(fieldsFor("homepageVideo").map((field) => field.name)).toEqual([
      "title",
      "youtubeId",
      "sortOrder",
    ]);
  });

  it("film schema exposes browsing metadata fields", () => {
    const film = schemaTypes.find((s) => s.name === "film");
    expect(film?.type).toBe("document");
    const fieldNames = fieldsFor("film").map((f) => f.name);

    expect(fieldNames).toEqual(
      expect.arrayContaining([
        "videoEmbed",
        "locations",
        "subjects",
        "formats",
        "skills",
        "displayTags",
      ]),
    );
    for (const metadataField of [
      "locations",
      "subjects",
      "formats",
      "skills",
      "displayTags",
    ]) {
      expect(
        fieldsFor("film").find((field) => field.name === metadataField)
          ?.validation,
      ).toBeTypeOf("function");
    }
  });

  it("film schema offers an optional uploaded poster image (falls back to video thumbnails)", () => {
    const posterField = fieldsFor("film").find((f) => f.name === "poster");

    expect(posterField?.type).toBe("image");
    // Optional override only — the auto video thumbnail remains the fallback.
    expect(posterField?.validation).toBeUndefined();
  });

  it("film schema only accepts supported YouTube or Vimeo video URLs", () => {
    const videoValidator = customValidatorFor("film", "videoEmbed");

    expect(videoValidator?.("https://www.youtube.com/watch?v=abc123DEF45")).toBe(
      true,
    );
    expect(videoValidator?.("https://vimeo.com/123456789/abcDEF123")).toBe(true);
    expect(videoValidator?.("https://example.com/video")).toBe(
      "Enter a supported YouTube or Vimeo URL.",
    );
  });

  it("film schema does not expose a detail-page gallery field", () => {
    const fieldNames = fieldsFor("film").map((field) => field.name);

    expect(fieldNames).not.toContain("gallery");
  });

  it("filmCollection schema references ordered films", () => {
    const collection = schemaTypes.find((s) => s.name === "filmCollection");
    expect(collection?.type).toBe("document");
    const fields = fieldsFor("filmCollection");
    const filmsField = fields.find((f) => f.name === "films");

    expect(fields.map((f) => f.name)).toEqual(
      expect.arrayContaining([
        "title",
        "slug",
        "description",
        "films",
        "sortOrder",
        "enabled",
      ]),
    );
    expect(filmsField?.type).toBe("array");
    expect(filmsField?.of?.[0]?.type).toBe("reference");
    expect(filmsField?.of?.[0]?.to?.[0]?.type).toBe("film");
    expect(filmsField?.validation).toBeTypeOf("function");
  });

  it("filmsPageSettings schema exposes row visibility controls", () => {
    const settings = schemaTypes.find((s) => s.name === "filmsPageSettings");
    const fields = fieldsFor("filmsPageSettings");

    expect(settings?.type).toBe("document");
    expect(fields.map((field) => field.name)).toEqual([
      "showLatestRow",
      "showAllVideosRow",
    ]);
    expect(fields.map((field) => field.type)).toEqual(["boolean", "boolean"]);
  });

  it("academyPageSettings schema exposes a single optional CTA background image", () => {
    const settings = schemaTypes.find((s) => s.name === "academyPageSettings");
    const fields = fieldsFor("academyPageSettings");
    const ctaImage = fields.find((field) => field.name === "ctaImage");

    expect(settings?.type).toBe("document");
    expect(fields.map((field) => field.name)).toEqual(["ctaImage"]);
    expect(ctaImage?.type).toBe("image");
    expect(ctaImage?.options?.hotspot).toBe(true);
    // Decorative behind an 80% scrim — alt stays optional.
    const alt = ctaImage?.fields?.find((f) => f.name === "alt");
    expect(alt?.type).toBe("string");
    expect(isRequired(alt)).toBe(false);
  });

  it("program schema exposes panel + overview images with hotspot and required alt", () => {
    for (const fieldName of ["panelImage", "overviewImage"]) {
      const field = fieldsFor("program").find((f) => f.name === fieldName);
      expect(field?.type).toBe("image");
      expect(field?.options?.hotspot).toBe(true);

      const alt = field?.fields?.find((f) => f.name === "alt");
      expect(alt?.type).toBe("string");
      expect(isRequired(alt)).toBe(true);
    }

    // heroImage keeps its optional alt — unchanged by this feature.
    const heroAlt = fieldsFor("program")
      .find((f) => f.name === "heroImage")
      ?.fields?.find((f) => f.name === "alt");
    expect(isRequired(heroAlt)).toBe(false);
  });

  it("film metadata validators reject normalized duplicate blanks and tags", () => {
    const metadataValidator = customValidatorFor("film", "locations");
    const displayTagsValidator = customValidatorFor("film", "displayTags");

    expect({
      metadataBlankDuplicate: metadataValidator?.(["", " "]),
      metadataCaseDuplicate: metadataValidator?.(["Shark", " shark "]),
      displayTagsBlankDuplicate: displayTagsValidator?.(["", " "]),
      displayTagsCaseDuplicate: displayTagsValidator?.(["Shark", " shark "]),
    }).toEqual({
      metadataBlankDuplicate:
        "Values must be unique after trimming and case normalization.",
      metadataCaseDuplicate:
        "Values must be unique after trimming and case normalization.",
      displayTagsBlankDuplicate:
        "Display tags must be unique after trimming and case normalization.",
      displayTagsCaseDuplicate:
        "Display tags must be unique after trimming and case normalization.",
    });
  });

  it("film credits can reference team members or external credit links", () => {
    const creditsField = fieldsFor("film").find(
      (field) => field.name === "credits",
    );
    const creditType = creditsField?.of?.[0] as
      | {
          fields?: SchemaField[];
        }
      | undefined;

    expect(creditsField?.type).toBe("array");
    expect(creditType?.fields?.map((field) => field.name)).toEqual(
      expect.arrayContaining(["role", "teamMember", "name", "externalLinks"]),
    );
    const teamMemberField = creditType?.fields?.find(
      (field) => field.name === "teamMember",
    );
    const externalLinksField = creditType?.fields?.find(
      (field) => field.name === "externalLinks",
    );

    expect(teamMemberField?.type).toBe("reference");
    expect(teamMemberField?.to?.[0]?.type).toBe("teamMember");
    expect(externalLinksField?.type).toBe("array");
    expect(externalLinksField?.of?.[0]?.type).toBe("object");
  });

  it("teamMember schema uses job title without a separate role field", () => {
    const fieldNames = fieldsFor("teamMember").map((field) => field.name);

    expect(fieldNames).toContain("title");
    expect(fieldNames).not.toContain("role");
  });

  it("portableText schema is an array type", () => {
    const pt = schemaTypes.find((s) => s.name === "portableText");
    expect(pt?.type).toBe("array");
  });

  it("program schema uses string enum for slug (not slug type)", () => {
    const program = schemaTypes.find((s) => s.name === "program");
    expect(program?.type).toBe("document");
    const fields = fieldsFor("program");
    const slugField = fields.find((f) => f.name === "slug");
    expect(slugField?.type).toBe("string");
  });
});
