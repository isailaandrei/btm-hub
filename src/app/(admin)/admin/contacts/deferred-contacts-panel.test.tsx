/**
 * @vitest-environment jsdom
 */

import { Suspense } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  applicationsContext: {
    applications: [],
    hasLoadedFullApplications: true,
  },
  contactsContext: {
    contactActivitySummaries: [],
    contactTags: [],
    // Tests reassign this to null to exercise the not-yet-cached path.
    contacts: [] as unknown[] | null,
    hasLoadedFullContacts: true,
    tagCategories: [],
    tags: [],
  },
  contactsPanel: vi.fn(() => <section data-testid="contacts-panel" />),
}));

vi.mock("../admin-data-provider", () => ({
  useAdminApplicationsData: () => mocks.applicationsContext,
  useAdminContactsData: () => mocks.contactsContext,
}));

vi.mock("./contacts-panel", () => ({
  ContactsPanel: mocks.contactsPanel,
}));

const { DeferredContactsPanel } = await import("./deferred-contacts-panel");

describe("DeferredContactsPanel", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    mocks.contactsPanel.mockClear();
    mocks.contactsContext.contacts = [];
    mocks.contactsContext.contactTags = [];
    mocks.contactsContext.contactActivitySummaries = [];
    mocks.contactsContext.tagCategories = [];
    mocks.contactsContext.tags = [];
    mocks.contactsContext.hasLoadedFullContacts = true;
    mocks.applicationsContext.applications = [];
    mocks.applicationsContext.hasLoadedFullApplications = true;
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function renderWithNeverResolvingInitialData() {
    const never = new Promise<never>(() => undefined);

    await act(async () => {
      root.render(
        <Suspense fallback={<section data-testid="fallback" />}>
          <DeferredContactsPanel initialContactsData={never} />
        </Suspense>,
      );
      await Promise.resolve();
    });
  }

  it("does not wait for server initial data when full provider data is cached", async () => {
    await renderWithNeverResolvingInitialData();

    expect(container.querySelector("[data-testid='contacts-panel']")).not.toBeNull();
    expect(container.querySelector("[data-testid='fallback']")).toBeNull();
    expect(mocks.contactsPanel).toHaveBeenCalledWith(
      expect.objectContaining({ initialData: undefined }),
      undefined,
    );
  });

  it("waits for server initial data when provider data is not cached yet", async () => {
    mocks.contactsContext.contacts = null;
    mocks.contactsContext.hasLoadedFullContacts = false;

    await renderWithNeverResolvingInitialData();

    expect(container.querySelector("[data-testid='contacts-panel']")).toBeNull();
    expect(container.querySelector("[data-testid='fallback']")).not.toBeNull();
  });
});

