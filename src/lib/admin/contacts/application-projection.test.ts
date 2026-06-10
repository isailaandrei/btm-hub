import { describe, expect, it } from "vitest";
import {
  buildApplicationProjectionSelect,
  getSafeApplicationAnswerKeys,
  reassembleProjectedApplications,
} from "./application-projection";

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
