import { describe, expect, it } from "vitest";
import {
  buildApplicationProjectionSelect,
  getSafeApplicationAnswerKeys,
  prependContactListApplication,
  reassembleProjectedApplications,
  type ContactListApplication,
} from "./application-projection";

function app(
  id: string,
  overrides: Partial<ContactListApplication> = {},
): ContactListApplication {
  return {
    id,
    contact_id: "c1",
    program: "photography" as ContactListApplication["program"],
    submitted_at: "2026-06-01T10:00:00.000Z",
    answers: {},
    ...overrides,
  };
}

describe("prependContactListApplication", () => {
  it("prepends a new application", () => {
    const result = prependContactListApplication([app("a")], app("b"), 100);
    expect(result.map((a) => a.id)).toEqual(["b", "a"]);
  });

  it("is idempotent by id — a re-delivered INSERT replaces, never duplicates", () => {
    const result = prependContactListApplication(
      [app("a"), app("b")],
      app("b", { submitted_at: "2026-07-01T00:00:00.000Z" }),
      100,
    );
    expect(result.map((a) => a.id)).toEqual(["b", "a"]);
    expect(result.filter((a) => a.id === "b")).toHaveLength(1);
    expect(result[0].submitted_at).toBe("2026-07-01T00:00:00.000Z");
  });

  it("caps the array at the limit, keeping the most recent", () => {
    const existing = [app("a"), app("b"), app("c")];
    const result = prependContactListApplication(existing, app("d"), 3);
    expect(result.map((a) => a.id)).toEqual(["d", "a", "b"]);
  });

  it("tolerates a null previous list", () => {
    expect(prependContactListApplication(null, app("a"), 5)).toEqual([app("a")]);
  });
});

describe("application contact-list projection", () => {
  it("keeps only field-registry answer keys with safe SQL identifier characters", () => {
    expect(
      getSafeApplicationAnswerKeys([
        "budget",
        "online_links",
        "missing_field",
        "budget;drop table applications",
        "Budget",
      ]),
    ).toEqual(["budget", "online_links"]);
  });

  it("always includes phone and aliases answer JSON paths without text coercion", () => {
    const projection = buildApplicationProjectionSelect(["budget", "age"]);

    expect(projection.answerKeys).toEqual(["phone", "budget", "age"]);
    expect(projection.select).toBe(
      "id, contact_id, program, submitted_at, ans_phone:answers->phone, ans_budget:answers->budget, ans_age:answers->age",
    );
  });

  it("reassembles aliased rows into sparse application answers", () => {
    const rows = [
      {
        id: "app-1",
        contact_id: "contact-1",
        program: "photography",
        submitted_at: "2026-01-01T00:00:00.000Z",
        ans_phone: "+351 123",
        ans_budget: ["1000", "2000"],
        ans_age: 34,
        ans_empty: null,
      },
    ];

    expect(
      reassembleProjectedApplications(rows, ["phone", "budget", "age", "empty"]),
    ).toEqual([
      {
        id: "app-1",
        contact_id: "contact-1",
        program: "photography",
        submitted_at: "2026-01-01T00:00:00.000Z",
        answers: {
          phone: "+351 123",
          budget: ["1000", "2000"],
          age: 34,
        },
      },
    ]);
  });
});
