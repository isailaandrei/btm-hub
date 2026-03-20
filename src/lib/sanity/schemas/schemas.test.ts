import { describe, it, expect } from "vitest";
import { schemaTypes } from "./index";

describe("sanity schemas", () => {
  it("exports all expected schema types", () => {
    const names = schemaTypes.map((s) => s.name);
    expect(names).toContain("portableText");
    expect(names).toContain("gallery");
    expect(names).toContain("socialLink");
    expect(names).toContain("faq");
    expect(names).toContain("testimonial");
    expect(names).toContain("film");
    expect(names).toContain("program");
    expect(names).toContain("teamMember");
    expect(names).toContain("partner");
  });

  it("has 9 total schema types (5 objects + 4 documents)", () => {
    expect(schemaTypes).toHaveLength(9);
  });

  it("film schema is a document type", () => {
    const film = schemaTypes.find((s) => s.name === "film");
    expect(film?.type).toBe("document");
  });

  it("portableText schema is an array type", () => {
    const pt = schemaTypes.find((s) => s.name === "portableText");
    expect(pt?.type).toBe("array");
  });

  it("program schema uses string enum for slug (not slug type)", () => {
    const program = schemaTypes.find((s) => s.name === "program");
    expect(program?.type).toBe("document");
    const fields = (program as { fields?: { name: string; type: string }[] })
      ?.fields;
    const slugField = fields?.find((f) => f.name === "slug");
    expect(slugField?.type).toBe("string");
  });
});
