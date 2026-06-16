/**
 * @vitest-environment jsdom
 */

import {
  act,
  useEffect,
  type Dispatch,
  type SetStateAction,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Contact } from "@/types/database";
import { BUILTIN_COLUMN, type SortState } from "./sort-helpers";
import { useContactsPanelState } from "./contacts-panel-state";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

vi.mock("./actions", () => ({
  updatePreferences: vi.fn(),
}));

const { updatePreferences } = await import("./actions");

type ContactsPanelState = ReturnType<typeof useContactsPanelState>;

function installLocalStorageMock() {
  const storage = new Map<string, string>();

  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      clear: () => storage.clear(),
      getItem: (key: string) => storage.get(key) ?? null,
      removeItem: (key: string) => storage.delete(key),
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
    },
  });
}

function StateHarness({
  onState,
  onRenderState,
  preferences = {},
}: {
  onState: (state: ContactsPanelState) => void;
  onRenderState?: (state: ContactsPanelState) => void;
  preferences?: Record<string, unknown>;
}) {
  const state = useContactsPanelState({
    contacts: [] satisfies Contact[],
    ensureContacts: () => undefined,
    preferences,
    setPreferences: vi.fn() as Dispatch<SetStateAction<Record<string, unknown>>>,
  });

  onRenderState?.(state);

  useEffect(() => {
    onState(state);
  }, [onState, state]);

  return (
    <>
      <button type="button" onClick={() => state.toggleSort(BUILTIN_COLUMN.name)}>
        Sort name
      </button>
      <button type="button" onClick={() => state.toggleSort(BUILTIN_COLUMN.tags)}>
        Sort tags
      </button>
      <button type="button" onClick={state.handleClearAllFilters}>
        Clear
      </button>
      <button type="button" onClick={() => state.setPageSize("all")}>
        Show all
      </button>
    </>
  );
}

describe("useContactsPanelState", () => {
  let root: Root;
  let container: HTMLDivElement;
  let latestState: ContactsPanelState | null;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    vi.useRealTimers();
    vi.mocked(updatePreferences).mockReset();
    vi.mocked(updatePreferences).mockResolvedValue({});
    installLocalStorageMock();
    localStorage.clear();
    latestState = null;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
    }
    container?.remove();
    localStorage.clear();
  });

  function renderHarness() {
    act(() => {
      root.render(<StateHarness onState={(state) => { latestState = state; }} />);
    });
  }

  function clickButton(label: string) {
    const button = [...container.querySelectorAll("button")].find(
      (element) => element.textContent === label,
    );
    if (!button) throw new Error(`Missing ${label} button`);

    act(() => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  }

  it("defaults to newest submitted contacts first", () => {
    renderHarness();

    expect(latestState?.sortBy).toEqual({
      key: BUILTIN_COLUMN.submittedAt,
      direction: "desc",
    } satisfies SortState);
  });

  it("initializes sort and page size from server preferences", () => {
    act(() => {
      root.render(
        <StateHarness
          preferences={{
            contacts_table: {
              sort_by: { key: BUILTIN_COLUMN.name, direction: "asc" },
              page_size: 50,
            },
          }}
          onState={(state) => { latestState = state; }}
        />,
      );
    });

    expect(latestState?.sortBy).toEqual({
      key: BUILTIN_COLUMN.name,
      direction: "asc",
    } satisfies SortState);
    expect(latestState?.pageSize).toBe(50);
  });

  it("initializes visible columns from server preferences on first render", () => {
    act(() => {
      root.render(
        <StateHarness
          preferences={{
            contacts_table: {
              visible_columns: ["budget"],
              previously_selected_columns: ["budget", "age"],
            },
          }}
          onState={(state) => { latestState = state; }}
        />,
      );
    });

    expect(latestState?.visibleColumns).toEqual(["budget"]);
    expect(latestState?.previouslySelectedColumns).toEqual(["budget", "age"]);
    // Initial render must not echo server preferences back to the server.
    expect(updatePreferences).not.toHaveBeenCalled();
  });

  it("restores localStorage filters after the first render", () => {
    localStorage.setItem(
      "btm-admin-contacts-filters",
      JSON.stringify({
        search: "zack",
        programFilter: ["academy"],
        selectedTagIds: ["tag-1"],
        pendingFilter: ["awaiting_btm"],
        columnFilters: { budget: ["1000"] },
        page: 3,
        columnWidths: {
          [BUILTIN_COLUMN.name]: 177,
          [BUILTIN_COLUMN.submittedAt]: 209,
        },
      }),
    );
    const renderStates: ContactsPanelState[] = [];

    act(() => {
      root.render(
        <StateHarness
          onRenderState={(state) => {
            renderStates.push(state);
          }}
          onState={(state) => {
            latestState = state;
          }}
        />,
      );
    });

    expect(renderStates[0].search).toBe("");
    expect(renderStates[0].page).toBe(1);
    expect(renderStates[0].columnWidths).toEqual({});
    expect(latestState?.search).toBe("zack");
    expect(latestState?.programFilter).toEqual(["academy"]);
    expect(latestState?.selectedTagIds).toEqual(["tag-1"]);
    expect(latestState?.pendingFilter).toEqual(["awaiting_btm"]);
    expect(latestState?.columnFilters).toEqual({ budget: ["1000"] });
    expect(latestState?.page).toBe(3);
    expect(latestState?.columnWidths).toEqual({
      [BUILTIN_COLUMN.name]: 177,
      [BUILTIN_COLUMN.submittedAt]: 209,
    });
  });

  it("falls back to visible columns for previously selected columns", () => {
    act(() => {
      root.render(
        <StateHarness
          preferences={{
            contacts_table: { visible_columns: ["budget"] },
          }}
          onState={(state) => { latestState = state; }}
        />,
      );
    });

    expect(latestState?.previouslySelectedColumns).toEqual(["budget"]);
  });

  it("writes legacy local sort and page size to server preferences once", async () => {
    vi.useFakeTimers();
    localStorage.setItem(
      "btm-admin-contacts-filters",
      JSON.stringify({
        sortBy: { key: BUILTIN_COLUMN.tags, direction: "desc" },
        pageSize: 150,
      }),
    );

    renderHarness();

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(updatePreferences).toHaveBeenCalledWith({
      contacts_table: {
        sort_by: { key: BUILTIN_COLUMN.tags, direction: "desc" },
        page_size: 150,
      },
    });
  });

  it("keeps all rows page size local instead of saving it to server preferences", async () => {
    vi.useFakeTimers();
    renderHarness();
    clickButton("Show all");

    expect(latestState?.pageSize).toBe("all");

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(updatePreferences).not.toHaveBeenCalled();
  });

  it("cycles tag sorting only through descending and off", () => {
    renderHarness();
    clickButton("Sort tags");

    expect(latestState?.sortBy).toEqual({
      key: BUILTIN_COLUMN.tags,
      direction: "desc",
    } satisfies SortState);

    clickButton("Sort tags");

    expect(latestState?.sortBy).toBeNull();
  });

  it("resets clear all filters to newest submitted contacts first", () => {
    renderHarness();
    clickButton("Sort name");

    expect(latestState?.sortBy).toEqual({
      key: BUILTIN_COLUMN.name,
      direction: "asc",
    } satisfies SortState);

    clickButton("Clear");

    expect(latestState?.sortBy).toEqual({
      key: BUILTIN_COLUMN.submittedAt,
      direction: "desc",
    } satisfies SortState);
  });
});
