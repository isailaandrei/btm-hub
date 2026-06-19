import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { logAdminTiming, startAdminTiming } from "@/lib/admin/timing";
import type {
  Application,
  Contact,
  ContactEvent,
} from "@/types/database";

export const CONTACT_DETAIL_TIMELINE_PAGE_SIZE = 25;

export type ContactDetailApplicationSummary = Pick<
  Application,
  | "id"
  | "contact_id"
  | "program"
  | "status"
  | "answers"
  | "submitted_at"
  | "updated_at"
>;

export interface ContactEventsPage {
  events: ContactEvent[];
  hasMore: boolean;
  nextCursor: string | null;
}

export interface ContactDetailBootstrapData extends ContactEventsPage {
  applications: ContactDetailApplicationSummary[];
  contact: Contact;
}

type ContactDetailBootstrapPayload = {
  applications?: unknown;
  contact?: unknown;
  events?: unknown;
};

type SupabaseErrorLike = {
  code?: string;
  message?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pageEvents(rows: ContactEvent[]): ContactEventsPage {
  const events = rows.slice(0, CONTACT_DETAIL_TIMELINE_PAGE_SIZE);
  const hasMore = rows.length > CONTACT_DETAIL_TIMELINE_PAGE_SIZE;
  const lastEvent = events.at(-1);

  return {
    events,
    hasMore,
    nextCursor: hasMore && lastEvent ? lastEvent.happened_at : null,
  };
}

function parseBootstrapPayload(
  payload: ContactDetailBootstrapPayload | null,
): ContactDetailBootstrapData | null {
  if (!payload) return null;
  const contact = asRecord(payload.contact);
  if (!contact) return null;

  const applications = Array.isArray(payload.applications)
    ? (payload.applications as ContactDetailApplicationSummary[])
    : [];
  const rawEvents = Array.isArray(payload.events)
    ? (payload.events as ContactEvent[])
    : [];
  const eventPage = pageEvents(rawEvents);

  return {
    ...eventPage,
    applications,
    contact: contact as unknown as Contact,
  };
}

function isMissingRpcError(error: SupabaseErrorLike) {
  return (
    error.code === "PGRST202" ||
    error.message?.includes("Could not find the function") === true
  );
}

async function getContactDetailBootstrapFallback(
  contactId: string,
  rpcError: SupabaseErrorLike,
): Promise<ContactDetailBootstrapData | null> {
  console.warn(
    "Falling back to separate contact detail queries because the bootstrap RPC is unavailable.",
    { contactId, error: rpcError.message ?? rpcError.code ?? "unknown" },
  );

  const startedAt = startAdminTiming();
  const supabase = await createClient();
  const [contactResult, applicationsResult, eventsResult] = await Promise.all([
    supabase
      .from("contacts")
      .select("id, email, name, phone, profile_id, created_at, updated_at")
      .eq("id", contactId)
      .maybeSingle(),
    supabase
      .from("applications")
      .select(
        "id, contact_id, program, status, ans_phone:answers->phone, submitted_at, updated_at",
      )
      .eq("contact_id", contactId)
      .order("submitted_at", { ascending: false }),
    supabase
      .from("contact_events")
      .select("*")
      .eq("contact_id", contactId)
      .order("happened_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(CONTACT_DETAIL_TIMELINE_PAGE_SIZE + 1),
  ]);

  if (contactResult.error) {
    throw new Error(
      `Failed to load contact detail: ${contactResult.error.message}`,
    );
  }
  if (applicationsResult.error) {
    throw new Error(
      `Failed to load contact applications: ${applicationsResult.error.message}`,
    );
  }
  if (eventsResult.error) {
    throw new Error(
      `Failed to load contact events: ${eventsResult.error.message}`,
    );
  }
  if (!contactResult.data) return null;

  const applications = ((applicationsResult.data ?? []) as Array<
    Record<string, unknown>
  >).map((row) => ({
    answers:
      row.ans_phone !== null && row.ans_phone !== undefined
        ? { phone: row.ans_phone }
        : {},
    contact_id: typeof row.contact_id === "string" ? row.contact_id : null,
    id: String(row.id),
    program: row.program as Application["program"],
    status: row.status as Application["status"],
    submitted_at: String(row.submitted_at),
    updated_at: String(row.updated_at),
  }));
  const eventPage = pageEvents((eventsResult.data ?? []) as ContactEvent[]);

  logAdminTiming("admin.contact.detail.bootstrap.fallback.server", startedAt, {
    applications: applications.length,
    contactId,
    events: eventPage.events.length,
    hasMoreEvents: eventPage.hasMore,
  });

  return {
    ...eventPage,
    applications,
    contact: contactResult.data as Contact,
  };
}

export const getContactDetailBootstrap = cache(
  async function getContactDetailBootstrap(
    contactId: string,
  ): Promise<ContactDetailBootstrapData | null> {
    const startedAt = startAdminTiming();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      "get_admin_contact_detail_bootstrap",
      {
        p_contact_id: contactId,
        p_event_limit: CONTACT_DETAIL_TIMELINE_PAGE_SIZE + 1,
      },
    );

    if (error) {
      if (isMissingRpcError(error)) {
        return getContactDetailBootstrapFallback(contactId, error);
      }
      throw new Error(`Failed to load contact detail: ${error.message}`);
    }

    const result = parseBootstrapPayload(
      data as ContactDetailBootstrapPayload | null,
    );

    logAdminTiming("admin.contact.detail.bootstrap.server", startedAt, {
      applications: result?.applications.length ?? 0,
      contactId,
      events: result?.events.length ?? 0,
      hasMoreEvents: result?.hasMore ?? false,
      status: result ? "found" : "missing",
    });

    return result;
  },
);

export async function getContactDetailApplication(
  applicationId: string,
): Promise<Application | null> {
  const startedAt = startAdminTiming();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("applications")
    .select("*")
    .eq("id", applicationId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load application detail: ${error.message}`);
  }

  logAdminTiming("admin.contact.application.detail.server", startedAt, {
    applicationId,
    status: data ? "found" : "missing",
  });

  return data as Application | null;
}

export async function getContactEventsPage(input: {
  contactId: string;
  before: string;
}): Promise<ContactEventsPage> {
  const startedAt = startAdminTiming();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contact_events")
    .select("*")
    .eq("contact_id", input.contactId)
    .lt("happened_at", input.before)
    .order("happened_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(CONTACT_DETAIL_TIMELINE_PAGE_SIZE + 1);

  if (error) {
    throw new Error(`Failed to load contact events: ${error.message}`);
  }

  const result = pageEvents((data ?? []) as ContactEvent[]);

  logAdminTiming("admin.contact.events.page.server", startedAt, {
    contactId: input.contactId,
    events: result.events.length,
    hasMoreEvents: result.hasMore,
  });

  return result;
}
