import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ADMIN_DATA_PROVIDER_PATH =
  "src/app/(admin)/admin/admin-data-provider.tsx";
const TASK_LOADERS_PATH =
  "src/app/(admin)/admin/tasks/task-loaders.ts";

describe("AdminDataProvider preferences", () => {
  it("does not fetch admin preferences through the browser Supabase client", () => {
    const source = readFileSync(ADMIN_DATA_PROVIDER_PATH, "utf8");

    expect(source).not.toContain("ensurePreferences");
    expect(source).not.toContain("supabase.auth.getUser()");
    expect(source).not.toContain('.select("preferences")');
  });
});

describe("AdminDataProvider application projection", () => {
  it("uses projected contact-list application rows instead of full admin application rows", () => {
    const source = readFileSync(ADMIN_DATA_PROVIDER_PATH, "utf8");

    expect(source).toContain("buildApplicationProjectionSelect");
    expect(source).toContain("reassembleProjectedApplications");
    expect(source).not.toContain("admin_notes");
    expect(source).not.toContain("tags, admin_notes");
  });
});

describe("AdminDataProvider activity summaries", () => {
  it("loads aggregate activity summaries instead of downloading contact_events", () => {
    const source = readFileSync(ADMIN_DATA_PROVIDER_PATH, "utf8");

    expect(source).toContain("contact_activity_summary");
    expect(source).not.toContain('.from("contact_events").select');
    expect(source).not.toContain("CONTACT_EVENT_SUMMARY_SELECT");
  });
});

describe("AdminDataProvider realtime resilience", () => {
  it("monitors every channel's subscribe status instead of subscribing blind", () => {
    const source = readFileSync(ADMIN_DATA_PROVIDER_PATH, "utf8");

    expect(source).not.toContain(".subscribe();");
    // Each channel gets its own keyed status handler (per-channel degradation
    // tracking), never a bare subscribe.
    expect(source).toContain(".subscribe(makeChannelStatusHandler(");
    expect(source).toContain("degradedChannelsRef");
    expect(source).toContain('status === "CHANNEL_ERROR"');
    expect(source).toContain('status === "TIMED_OUT"');
  });

  it("resyncs on reconnect and on tab wake (postgres_changes cannot replay the gap)", () => {
    const source = readFileSync(ADMIN_DATA_PROVIDER_PATH, "utf8");

    expect(source).toContain("resyncContactsData");
    expect(source).toContain("resyncAdminData");
    expect(source).toContain('addEventListener("visibilitychange"');
    expect(source).toContain('addEventListener("online"');
    expect(source).toContain("REALTIME_RESYNC_MIN_INTERVAL_MS");
  });

  it("resyncs only when the LAST degraded channel recovers, and forces past the wake throttle", () => {
    const source = readFileSync(ADMIN_DATA_PROVIDER_PATH, "utf8");

    // Recovery gated on the whole degraded set draining, not the first channel.
    expect(source).toContain("degraded.size === 0");
    // Recovery bypasses the wake throttle so a wake resync mid-reconnect can't
    // swallow the convergence.
    expect(source).toContain("resyncRef.current({ force: true })");
    expect(source).toContain("options?.force");
  });

  it("surfaces realtime refetch failures instead of silently keeping stale tags", () => {
    const source = readFileSync(ADMIN_DATA_PROVIDER_PATH, "utf8");

    expect(source).toContain('toast.error("Failed to refresh tag categories.")');
    expect(source).toContain('toast.error("Failed to refresh tags.")');
  });

  it("prepends realtime application inserts idempotently", () => {
    const source = readFileSync(ADMIN_DATA_PROVIDER_PATH, "utf8");

    expect(source).toContain("prependContactListApplication");
  });
});

describe("AdminDataProvider task profiles", () => {
  it("does not own task assignee profile fetching", () => {
    const source = readFileSync(ADMIN_DATA_PROVIDER_PATH, "utf8");

    expect(source).not.toContain("useAdminProfilesData");
    expect(source).not.toContain("AdminProfilesContext");
    expect(source).not.toContain('.from("profiles")');
  });

  it("loads trimmed task assignee profiles with the task board payload", () => {
    const source = readFileSync(TASK_LOADERS_PATH, "utf8");
    const select = source.match(
      /\.from\("profiles"\)\s*\.select\("([^"]+)"\)/,
    )?.[1];

    expect(select).toBe(
      "id, email, role, display_name, avatar_url, created_at, updated_at",
    );
    expect(select).not.toContain("bio");
    expect(select).not.toContain("preferences");
  });
});
