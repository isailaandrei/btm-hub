import { describe, expect, it } from "vitest";
import {
  getAdminContactsInitialQuery,
  type AdminContactsInitialData,
} from "./admin-contact-list";

describe("admin contacts initial query", () => {
  it("uses server page size and native contact sort preferences", () => {
    expect(
      getAdminContactsInitialQuery({
        contacts_table: {
          page_size: 50,
          sort_by: { key: "email", direction: "desc" },
        },
      }),
    ).toEqual({
      pageSize: 50,
      nativeSort: { key: "email", ascending: false },
      isSortApproximateUntilHydration: false,
      answerKeys: [],
    });
  });

  it("falls back to name sort for non-native saved sorts and requests visible answer keys", () => {
    expect(
      getAdminContactsInitialQuery({
        contacts_table: {
          visible_columns: ["budget", "bad key"],
          sort_by: { key: "submitted_at", direction: "desc" },
        },
      }),
    ).toEqual({
      pageSize: 25,
      nativeSort: { key: "name", ascending: true },
      isSortApproximateUntilHydration: true,
      answerKeys: ["budget"],
    });
  });

  it("defines the first-page data shape consumed by the admin dashboard", () => {
    const data: AdminContactsInitialData = {
      applications: [],
      contactActivitySummaries: [],
      contactTags: [],
      contacts: [],
      isSortApproximateUntilHydration: false,
      pageSize: 25,
      tagCategories: [],
      tags: [],
      totalCount: 0,
    };

    expect(data.totalCount).toBe(0);
  });
});
