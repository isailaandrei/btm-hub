import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { logAdminTiming, startAdminTiming } from "@/lib/admin/timing";
import { normalizePhoneNumber } from "@/lib/conversations/phone";
import {
  getContactById,
  getContactTags,
  getTagCategories,
  getTags,
} from "./contacts";
import { getActiveSuppressionForContact } from "./email-suppressions";
import {
  listContactConversationMessages,
  type ContactConversationMessage,
} from "./conversations";
import type {
  Application,
  Contact,
  ContactEvent,
  EmailSuppressionReason,
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

/**
 * Optional pre-fetched data for the detail panel's lazy sections. Seeded only
 * by the server route (deep link / refresh) so a cold entry paints complete in
 * one round-trip instead of a serial chain of mount-time server actions —
 * React runs Server Actions one-at-a-time per client, so N lazy sections cost
 * N sequential round-trips on a cold open (docs/plans/deep-link-batching.md).
 *
 * A `null` slice means "not preloaded" (the query failed and was logged, or the
 * entry came from the client-side loader, which skips sections): the section
 * lazy-loads exactly as before, keeping its own visible error/retry UX.
 * Portfolio is deliberately NOT here — it is the heaviest payload and rarely
 * the reason a contact is opened (see PortfolioSectionClient).
 */
export interface ContactDetailSectionsData {
  emailStatus: {
    excluded: boolean;
    reason: EmailSuppressionReason | null;
  } | null;
  tagSection: {
    allTags: Awaited<ReturnType<typeof getTags>>;
    categories: Awaited<ReturnType<typeof getTagCategories>>;
    contactTagRows: Awaited<ReturnType<typeof getContactTags>>;
  } | null;
  whatsappMessages: ContactConversationMessage[] | null;
}

export interface ContactDetailBootstrapData extends ContactEventsPage {
  applications: ContactDetailApplicationSummary[];
  contact: Contact;
  /** Present only on server-route (deep-link) bootstraps — see ContactDetailSectionsData. */
  sections?: ContactDetailSectionsData;
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

/**
 * Best-effort section preload: a failing slice must never fail the whole page
 * (the section then lazy-loads and surfaces its own error+retry), but the
 * failure is logged loudly — never silently faked as empty data.
 */
async function loadDetailSection<T>(
  section: string,
  contactId: string,
  fn: () => Promise<T>,
): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    console.error(
      `[contact-detail] Failed to preload the ${section} section — the panel will lazy-load it instead`,
      {
        contactId,
        error: error instanceof Error ? error.message : String(error),
      },
    );
    return null;
  }
}

/**
 * Deep-link bootstrap for the whole contact page: the core bootstrap plus the
 * lazy sections' data, fetched in PARALLEL server-side (a handful of ~ms-range
 * queries) instead of the panel's serial mount-time action chain. Client-side
 * loaders (`loadContactDetailAction`) intentionally keep returning the core
 * bootstrap only — in-app opens already render instantly from the session
 * cache and the sections' own actions remain the refresh path.
 *
 * The slice bodies mirror `loadContactEmailSection` / `loadContactTagSectionData`
 * / `loadContactWhatsAppMessages` (the sections' server actions) — keep them in
 * sync. `getContactById` is `cache()`-wrapped, so the email and WhatsApp slices
 * share one contact fetch per request.
 */
export async function getContactDetailPageBootstrap(
  contactId: string,
): Promise<ContactDetailBootstrapData | null> {
  const startedAt = startAdminTiming();

  const [bootstrap, emailStatus, tagSection, whatsappMessages] =
    await Promise.all([
      getContactDetailBootstrap(contactId),
      loadDetailSection("email", contactId, async () => {
        const contact = await getContactById(contactId);
        if (!contact) return null;
        const suppression = await getActiveSuppressionForContact({
          contactId,
          email: contact.email,
        });
        return {
          excluded: Boolean(suppression),
          reason: suppression?.reason ?? null,
        };
      }),
      loadDetailSection("tags", contactId, async () => {
        const [contactTagRows, categories, allTags] = await Promise.all([
          getContactTags(contactId),
          getTagCategories(),
          getTags(),
        ]);
        return { allTags, categories, contactTagRows };
      }),
      loadDetailSection("whatsapp", contactId, async () => {
        const contact = await getContactById(contactId);
        if (!contact) return null;
        const phoneE164 = normalizePhoneNumber(contact.phone)?.e164 ?? null;
        return listContactConversationMessages({ contactId, phoneE164 });
      }),
    ]);

  if (!bootstrap) return null;

  logAdminTiming("admin.contact.detail.page-bootstrap.server", startedAt, {
    contactId,
    emailStatus: emailStatus ? "seeded" : "skipped",
    tagSection: tagSection ? "seeded" : "skipped",
    whatsappMessages: whatsappMessages ? whatsappMessages.length : "skipped",
  });

  return {
    ...bootstrap,
    sections: { emailStatus, tagSection, whatsappMessages },
  };
}

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
