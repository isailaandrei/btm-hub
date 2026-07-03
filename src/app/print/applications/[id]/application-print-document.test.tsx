import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Application } from "@/types/database";
import {
  ApplicationPrintDocument,
  applicantDisplayName,
  buildDocumentTitle,
  formatAnswer,
} from "./application-print-document";

function makeApplication(overrides: Partial<Application> = {}): Application {
  return {
    id: "550e8400-e29b-41d4-a716-446655440002",
    user_id: null,
    contact_id: "550e8400-e29b-41d4-a716-446655440001",
    program: "photography",
    status: "reviewing",
    answers: {},
    tags: [],
    admin_notes: [],
    submitted_at: "2026-06-01T10:00:00.000Z",
    updated_at: "2026-06-02T10:00:00.000Z",
    ...overrides,
  };
}

describe("formatAnswer", () => {
  it("collapses empty values to an empty string", () => {
    expect(formatAnswer(null)).toBe("");
    expect(formatAnswer(undefined)).toBe("");
    expect(formatAnswer("")).toBe("");
    expect(formatAnswer([])).toBe("");
  });

  it("joins arrays and renders ratings out of 10", () => {
    expect(formatAnswer(["Freediving", "Scuba"])).toBe("Freediving, Scuba");
    expect(formatAnswer(7)).toBe("7/10");
    expect(formatAnswer("Hello")).toBe("Hello");
  });
});

describe("applicantDisplayName", () => {
  it("prefers first + last name, then name, then email, then a fallback", () => {
    expect(applicantDisplayName({ first_name: "Jane", last_name: "Doe" })).toBe(
      "Jane Doe",
    );
    expect(applicantDisplayName({ name: "Jane D." })).toBe("Jane D.");
    expect(applicantDisplayName({ email: "jane@example.com" })).toBe(
      "jane@example.com",
    );
    expect(applicantDisplayName({})).toBe("Applicant");
  });
});

describe("buildDocumentTitle", () => {
  it("uses '<applicant> - BTM Application' for the PDF filename", () => {
    const app = makeApplication({
      answers: { first_name: "Jane", last_name: "Doe" },
    });
    expect(buildDocumentTitle(app)).toBe("Jane Doe - BTM Application");
  });
});

describe("ApplicationPrintDocument", () => {
  const app = makeApplication({
    status: "reviewing",
    answers: {
      first_name: "Jane",
      last_name: "Doe",
      email: "jane@example.com",
      buoyancy_skill: 7,
      diving_types: ["Freediving", "Scuba"],
    },
    admin_notes: [
      {
        author_id: "a",
        author_name: "Admin",
        text: "INTERNAL_SECRET_NOTE",
        created_at: "2026-06-01T10:00:00.000Z",
      },
    ],
    tags: ["confidential-tag"],
  });

  const html = renderToStaticMarkup(
    <ApplicationPrintDocument application={app} />,
  );

  it("renders the full header: brand, program, applicant, submitted date and status", () => {
    expect(html).toContain("Behind The Mask");
    expect(html).toContain("Photography Application");
    expect(html).toContain("Jane Doe");
    expect(html).toContain("Submitted");
    expect(html).toContain("Reviewing"); // status label
  });

  it("renders answered fields with human-readable labels and values", () => {
    expect(html).toContain("First Name");
    expect(html).toContain("Jane");
    expect(html).toContain("Diving Experience"); // section title
    expect(html).toContain("7/10"); // rating
    expect(html).toContain("Freediving, Scuba"); // multiselect
  });

  it("omits fields the applicant did not answer", () => {
    // `last_dive_date` / `gender` were never answered → their labels must not
    // appear (no wall of blank rows in a shared document).
    expect(html).not.toContain("Last diving activity date");
    expect(html).not.toContain("Gender");
  });

  it("never leaks internal admin notes or tags", () => {
    expect(html).not.toContain("INTERNAL_SECRET_NOTE");
    expect(html).not.toContain("confidential-tag");
  });
});
