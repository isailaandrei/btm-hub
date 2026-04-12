import { describe, it, expect } from "vitest";
import { getSortValue, compareContacts } from "./sort-helpers";
import type { FieldRegistryEntry } from "./field-registry";
import { normalizeAgeToRange } from "./field-registry";
import type { Application, Contact } from "@/types/database";

// --- Fixtures ------------------------------------------------------------

function makeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: "c1",
    email: "test@example.com",
    name: "Alice Zebra",
    phone: "+10000000001",
    profile_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeApp(
  overrides: Partial<Application> & { answers: Record<string, unknown> },
): Application {
  return {
    id: "a1",
    user_id: null,
    contact_id: "c1",
    program: "filmmaking",
    status: "reviewing",
    tags: [],
    admin_notes: [],
    submitted_at: "2026-04-01T12:00:00Z",
    updated_at: "2026-04-01T12:00:00Z",
    ...overrides,
  } as Application;
}

const ratingField: FieldRegistryEntry = {
  key: "buoyancy_skill",
  label: "Buoyancy Skill",
  type: "rating",
  options: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],
  programs: ["filmmaking"],
  curated: false,
};

const dateField: FieldRegistryEntry = {
  key: "last_dive_date",
  label: "Last Dive",
  type: "date",
  options: [],
  programs: ["filmmaking"],
  curated: false,
};

const budgetField: FieldRegistryEntry = {
  key: "budget",
  label: "Budget",
  type: "select",
  options: ["Small", "Medium", "Large"],
  programs: ["filmmaking"],
  curated: true,
};

const ageField: FieldRegistryEntry = {
  key: "age",
  label: "Age Range",
  type: "select",
  options: ["18-24", "25-34", "35-44", "45-54", "55+"],
  programs: ["filmmaking", "photography", "freediving", "internship"],
  curated: false,
  canonical: {
    options: ["18-24", "25-34", "35-44", "45-54", "55+"],
    normalize: normalizeAgeToRange,
  },
};

const multiselectField: FieldRegistryEntry = {
  key: "diving_types",
  label: "Types of Diving",
  type: "multiselect",
  options: ["Scuba", "Free", "Snorkel"],
  programs: ["filmmaking"],
  curated: false,
};

// --- getSortValue --------------------------------------------------------

describe("getSortValue — built-in columns", () => {
  it("returns lowercased name", () => {
    const c = makeContact({ name: "Alice Zebra" });
    expect(getSortValue(c, "name", new Map(), undefined)).toBe("alice zebra");
  });

  it("returns lowercased email", () => {
    const c = makeContact({ email: "Alice@Example.COM" });
    expect(getSortValue(c, "email", new Map(), undefined)).toBe(
      "alice@example.com",
    );
  });

  it("returns phone or null", () => {
    expect(
      getSortValue(
        makeContact({ phone: "+1234" }),
        "phone",
        new Map(),
        undefined,
      ),
    ).toBe("+1234");
    expect(
      getSortValue(makeContact({ phone: null }), "phone", new Map(), undefined),
    ).toBeNull();
  });

  it("returns most recent app's submitted_at for submitted_at column", () => {
    const c = makeContact();
    const apps = [
      makeApp({ id: "a2", submitted_at: "2026-04-10T00:00:00Z", answers: {} }),
      makeApp({ id: "a1", submitted_at: "2026-03-05T00:00:00Z", answers: {} }),
    ];
    const map = new Map([[c.id, apps]]);
    expect(getSortValue(c, "submitted_at", map, undefined)).toBe(
      "2026-04-10T00:00:00Z",
    );
  });

  it("returns null when contact has no applications for submitted_at", () => {
    const c = makeContact();
    expect(getSortValue(c, "submitted_at", new Map(), undefined)).toBeNull();
  });
});

describe("getSortValue — registry columns without canonical", () => {
  it("returns the numeric value for rating fields", () => {
    const c = makeContact();
    const apps = [makeApp({ answers: { buoyancy_skill: 7 } })];
    expect(
      getSortValue(c, "buoyancy_skill", new Map([[c.id, apps]]), ratingField),
    ).toBe(7);
  });

  it("parses string-typed rating values", () => {
    const c = makeContact();
    const apps = [makeApp({ answers: { buoyancy_skill: "8" } })];
    expect(
      getSortValue(c, "buoyancy_skill", new Map([[c.id, apps]]), ratingField),
    ).toBe(8);
  });

  it("returns Date.parse millis for date fields", () => {
    const c = makeContact();
    const apps = [makeApp({ answers: { last_dive_date: "2026-03-15" } })];
    const val = getSortValue(
      c,
      "last_dive_date",
      new Map([[c.id, apps]]),
      dateField,
    );
    expect(val).toBe(Date.parse("2026-03-15"));
  });

  it("returns canonical options index for select fields", () => {
    const c = makeContact();
    const apps = [makeApp({ answers: { budget: "Medium" } })];
    expect(
      getSortValue(c, "budget", new Map([[c.id, apps]]), budgetField),
    ).toBe(1);
  });

  it("returns MAX_SAFE_INTEGER for out-of-list values", () => {
    const c = makeContact();
    const apps = [makeApp({ answers: { budget: "Weird custom text" } })];
    expect(
      getSortValue(c, "budget", new Map([[c.id, apps]]), budgetField),
    ).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("uses the first element of multiselect arrays", () => {
    const c = makeContact();
    const apps = [
      makeApp({ answers: { diving_types: ["Free", "Snorkel"] } }),
    ];
    expect(
      getSortValue(c, "diving_types", new Map([[c.id, apps]]), multiselectField),
    ).toBe(1); // "Free" is at index 1
  });
});

describe("getSortValue — canonical normalization", () => {
  it("maps numeric age to the same bucket index as the canonical range", () => {
    const c1 = makeContact({ id: "c1" });
    const c2 = makeContact({ id: "c2" });
    const apps1 = [makeApp({ answers: { age: "21" } })]; // numeric internship
    const apps2 = [makeApp({ answers: { age: "18-24" } })]; // canonical range
    const map = new Map([
      [c1.id, apps1],
      [c2.id, apps2],
    ]);
    const val1 = getSortValue(c1, "age", map, ageField);
    const val2 = getSortValue(c2, "age", map, ageField);
    expect(val1).toBe(val2);
    expect(val1).toBe(0); // both map to "18-24" (index 0)
  });

  it("non-mappable age values sort last", () => {
    const c = makeContact();
    const apps = [makeApp({ answers: { age: "not a number" } })];
    expect(getSortValue(c, "age", new Map([[c.id, apps]]), ageField)).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });

  it("24 years old outlier maps to bucket 0", () => {
    const c = makeContact();
    const apps = [makeApp({ answers: { age: "24 years old" } })];
    expect(getSortValue(c, "age", new Map([[c.id, apps]]), ageField)).toBe(0);
  });
});

describe("getSortValue — multi-app contacts and edge cases", () => {
  it("uses the first (most recent) application's value", () => {
    const c = makeContact();
    const apps = [
      makeApp({ id: "a1", answers: { budget: "Large" } }),
      makeApp({ id: "a2", answers: { budget: "Small" } }),
    ];
    expect(
      getSortValue(c, "budget", new Map([[c.id, apps]]), budgetField),
    ).toBe(2); // "Large" is at index 2
  });

  it("returns null when contact has no apps in the map", () => {
    const c = makeContact();
    expect(
      getSortValue(c, "budget", new Map(), budgetField),
    ).toBeNull();
  });

  it("returns null when raw answer is missing", () => {
    const c = makeContact();
    const apps = [makeApp({ answers: {} })];
    expect(
      getSortValue(c, "budget", new Map([[c.id, apps]]), budgetField),
    ).toBeNull();
  });

  it("returns null for empty string select values", () => {
    const c = makeContact();
    const apps = [makeApp({ answers: { budget: "" } })];
    expect(
      getSortValue(c, "budget", new Map([[c.id, apps]]), budgetField),
    ).toBeNull();
  });

  it("returns null for unknown registry columns with no field", () => {
    const c = makeContact();
    expect(getSortValue(c, "unknown_key", new Map(), undefined)).toBeNull();
  });
});

// --- compareContacts -----------------------------------------------------

describe("compareContacts", () => {
  const appsMap = new Map<string, Application[]>();

  it("ascending numeric comparison", () => {
    const a = makeContact({ id: "a" });
    const b = makeContact({ id: "b" });
    const map = new Map([
      [a.id, [makeApp({ answers: { buoyancy_skill: 3 } })]],
      [b.id, [makeApp({ answers: { buoyancy_skill: 7 } })]],
    ]);
    expect(
      compareContacts(
        a,
        b,
        { key: "buoyancy_skill", direction: "asc" },
        map,
        ratingField,
      ),
    ).toBeLessThan(0);
  });

  it("descending reverses the comparison", () => {
    const a = makeContact({ id: "a" });
    const b = makeContact({ id: "b" });
    const map = new Map([
      [a.id, [makeApp({ answers: { buoyancy_skill: 3 } })]],
      [b.id, [makeApp({ answers: { buoyancy_skill: 7 } })]],
    ]);
    expect(
      compareContacts(
        a,
        b,
        { key: "buoyancy_skill", direction: "desc" },
        map,
        ratingField,
      ),
    ).toBeGreaterThan(0);
  });

  it("ascending string comparison uses localeCompare", () => {
    const a = makeContact({ id: "a", name: "Zara" });
    const b = makeContact({ id: "b", name: "Alice" });
    expect(
      compareContacts(a, b, { key: "name", direction: "asc" }, appsMap, undefined),
    ).toBeGreaterThan(0);
  });

  it("null values sort LAST in ascending", () => {
    const a = makeContact({ id: "a", phone: "+1234" });
    const b = makeContact({ id: "b", phone: null });
    expect(
      compareContacts(
        a,
        b,
        { key: "phone", direction: "asc" },
        appsMap,
        undefined,
      ),
    ).toBeLessThan(0);
    expect(
      compareContacts(
        b,
        a,
        { key: "phone", direction: "asc" },
        appsMap,
        undefined,
      ),
    ).toBeGreaterThan(0);
  });

  it("null values ALSO sort LAST in descending (not flipped)", () => {
    const a = makeContact({ id: "a", phone: "+1234" });
    const b = makeContact({ id: "b", phone: null });
    // With direction=desc, a > b (cmp returns positive), b < a (negative).
    // But null-last means b should still come last (positive when sorted).
    expect(
      compareContacts(
        a,
        b,
        { key: "phone", direction: "desc" },
        appsMap,
        undefined,
      ),
    ).toBeLessThan(0);
    expect(
      compareContacts(
        b,
        a,
        { key: "phone", direction: "desc" },
        appsMap,
        undefined,
      ),
    ).toBeGreaterThan(0);
  });

  it("two nulls tie", () => {
    const a = makeContact({ id: "a", phone: null });
    const b = makeContact({ id: "b", phone: null });
    expect(
      compareContacts(
        a,
        b,
        { key: "phone", direction: "asc" },
        appsMap,
        undefined,
      ),
    ).toBe(0);
  });

  it("sorts a list end-to-end by numeric rating ascending", () => {
    const c1 = makeContact({ id: "1" });
    const c2 = makeContact({ id: "2" });
    const c3 = makeContact({ id: "3" });
    const map = new Map([
      [c1.id, [makeApp({ answers: { buoyancy_skill: 5 } })]],
      [c2.id, [makeApp({ answers: { buoyancy_skill: 2 } })]],
      [c3.id, [makeApp({ answers: { buoyancy_skill: 8 } })]],
    ]);
    const sorted = [c1, c2, c3].sort((a, b) =>
      compareContacts(
        a,
        b,
        { key: "buoyancy_skill", direction: "asc" },
        map,
        ratingField,
      ),
    );
    expect(sorted.map((c) => c.id)).toEqual(["2", "1", "3"]);
  });
});
