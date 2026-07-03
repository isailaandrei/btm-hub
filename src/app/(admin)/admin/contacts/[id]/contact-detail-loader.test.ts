import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContactDetailBootstrapData } from "@/lib/data/contact-detail";

const mockLoad = vi.fn();
vi.mock("./contact-detail-actions", () => ({
  loadContactDetailAction: mockLoad,
}));

const { warmContactDetail, refreshContactDetailAfterMutation } = await import(
  "./contact-detail-loader"
);
const { contactDetailCacheStore } = await import("../contact-detail-cache");

const ID = "11111111-1111-1111-1111-000000000001";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function bootstrap(name: string): ContactDetailBootstrapData {
  return {
    contact: { id: ID, name } as ContactDetailBootstrapData["contact"],
    applications: [],
    events: [],
    hasMore: false,
    nextCursor: null,
  };
}

describe("contact-detail loader", () => {
  beforeEach(() => {
    // Deterministic, strictly-increasing request-time stamps so last-write-wins
    // is testable regardless of promise-resolution order.
    let now = 1000;
    vi.spyOn(Date, "now").mockImplementation(() => (now += 1));
  });

  afterEach(() => {
    mockLoad.mockReset();
    contactDetailCacheStore.clear();
    vi.restoreAllMocks();
  });

  it("dedups concurrent non-forced loads onto a single request", async () => {
    const d = deferred<ContactDetailBootstrapData>();
    mockLoad.mockReturnValue(d.promise);

    const p1 = warmContactDetail(ID);
    const p2 = warmContactDetail(ID);

    expect(mockLoad).toHaveBeenCalledTimes(1);
    expect(p1).toBe(p2);

    d.resolve(bootstrap("A"));
    await p1;
  });

  it("forces a new load after a mutation instead of coalescing onto a pre-commit in-flight load", async () => {
    const preCommit = deferred<ContactDetailBootstrapData>();
    const postCommit = deferred<ContactDetailBootstrapData>();
    mockLoad
      .mockReturnValueOnce(preCommit.promise)
      .mockReturnValueOnce(postCommit.promise);

    // L1: a load that started BEFORE the mutation committed (e.g. realtime).
    const l1 = warmContactDetail(ID);
    expect(mockLoad).toHaveBeenCalledTimes(1);

    // The mutation commits; the refresh must issue a NEW load, not return L1.
    const refreshed = refreshContactDetailAfterMutation(ID);
    expect(mockLoad).toHaveBeenCalledTimes(2);
    expect(refreshed).not.toBe(l1);

    // The dangerous order: the post-commit load resolves first, then the stale
    // pre-commit load resolves LATE — it must not clobber the fresh data.
    postCommit.resolve(bootstrap("post-commit"));
    preCommit.resolve(bootstrap("pre-commit"));
    await Promise.all([l1, refreshed]);

    expect(contactDetailCacheStore.get(ID)?.data.contact.name).toBe(
      "post-commit",
    );
    expect(contactDetailCacheStore.get(ID)?.status).toBe("fresh");
  });

  it("a stale in-flight load that resolves after a forced reload never wins", async () => {
    const preCommit = deferred<ContactDetailBootstrapData>();
    const postCommit = deferred<ContactDetailBootstrapData>();
    mockLoad
      .mockReturnValueOnce(preCommit.promise)
      .mockReturnValueOnce(postCommit.promise);

    warmContactDetail(ID);
    const refreshed = refreshContactDetailAfterMutation(ID);

    // Forced (post-commit) load settles and populates the cache.
    postCommit.resolve(bootstrap("post-commit"));
    await refreshed;
    expect(contactDetailCacheStore.get(ID)?.data.contact.name).toBe(
      "post-commit",
    );

    // The older pre-commit load settles afterwards — last-write-wins by
    // request-time stamp keeps the newer data.
    preCommit.resolve(bootstrap("pre-commit"));
    await Promise.resolve();
    expect(contactDetailCacheStore.get(ID)?.data.contact.name).toBe(
      "post-commit",
    );
  });
});
