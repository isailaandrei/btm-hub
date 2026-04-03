# Direct Messaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one-to-one private messaging to the community section with real-time delivery, unread badges, and rich text support.

**Architecture:** Messages live under `/community/messages` using the existing community layout. A `MessagesSidebar` section is added below topics in `ChannelSidebar`. Real-time uses Supabase Realtime (same pattern as admin panel). The TipTap editor is reused with a stripped-down config (bold, italic, link only).

**Tech Stack:** Next.js 16 (App Router), React 19, Supabase (Postgres + Realtime + RLS), TipTap, Tailwind CSS 4, Zod 4

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `supabase/migrations/20260402000002_dm_tables.sql` | Database tables, RLS, indexes, triggers |
| `src/types/database.ts` (modify) | Add `DmConversation`, `DmMessage`, `DmReadReceipt` types |
| `src/lib/validations/messages.ts` | Zod schemas for send/edit message |
| `src/lib/data/messages.ts` | Server-side data fetchers (cached) |
| `src/app/(marketing)/community/messages/actions.ts` | Server actions: send, edit, delete, markAsRead, startConversation |
| `src/app/(marketing)/community/messages/page.tsx` | Empty state page ("Select a conversation") |
| `src/app/(marketing)/community/messages/[conversationId]/page.tsx` | Chat view (server component, initial fetch) |
| `src/components/community/MessagesSidebar.tsx` | Conversation list + inline user search |
| `src/components/community/MessageThread.tsx` | Message list with real-time subscription |
| `src/components/community/MessageBubble.tsx` | Single message bubble (avatar, body, timestamp, edited, actions) |
| `src/components/community/MessageComposer.tsx` | TipTap editor (bold, italic, link) |
| `src/components/layout/UnreadBadge.tsx` | Navbar unread count badge (client component) |

### Modified files

| File | Changes |
|------|---------|
| `src/components/community/ChannelSidebar.tsx` | Add `MessagesSidebar` below topics section |
| `src/app/(marketing)/community/layout.tsx` | Pass `currentUserId` to sidebar |
| `src/components/layout/AuthButtons.tsx` | Add `UnreadBadge` for logged-in users |

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260402000002_dm_tables.sql`

- [ ] **Step 1: Write the migration SQL**

Create the migration file with all three tables, RLS policies, indexes, triggers, and grants:

```sql
-- ============================================================================
-- Direct Messaging: dm_conversations + dm_messages + dm_read_receipts
-- One-to-one DMs with RLS, real-time support, and unread tracking
-- ============================================================================

-- --------------------------------------------------------------------------
-- Tables
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."dm_conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user1_id" "uuid",
    "user2_id" "uuid",
    "last_message_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,

    CONSTRAINT "dm_conversations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "dm_conversations_pair_key" UNIQUE ("user1_id", "user2_id"),
    CONSTRAINT "dm_conversations_ordered_pair" CHECK (
        "user1_id" IS NULL OR "user2_id" IS NULL OR "user1_id" < "user2_id"
    )
);

ALTER TABLE "public"."dm_conversations" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."dm_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "sender_id" "uuid",
    "body" "text" NOT NULL,
    "body_format" "text" NOT NULL DEFAULT 'html',
    "edited_at" timestamp with time zone,
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,

    CONSTRAINT "dm_messages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "dm_messages_body_length" CHECK (
        char_length("body") >= 1 AND char_length("body") <= 5000
    ),
    CONSTRAINT "dm_messages_body_format_check" CHECK (
        "body_format" IN ('text', 'html')
    )
);

ALTER TABLE "public"."dm_messages" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."dm_read_receipts" (
    "conversation_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "last_read_at" timestamp with time zone DEFAULT "now"() NOT NULL,

    CONSTRAINT "dm_read_receipts_pkey" PRIMARY KEY ("conversation_id", "user_id")
);

ALTER TABLE "public"."dm_read_receipts" OWNER TO "postgres";

-- --------------------------------------------------------------------------
-- Foreign keys
-- --------------------------------------------------------------------------

ALTER TABLE "public"."dm_conversations"
    ADD CONSTRAINT "dm_conversations_user1_fkey"
    FOREIGN KEY ("user1_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;

ALTER TABLE "public"."dm_conversations"
    ADD CONSTRAINT "dm_conversations_user2_fkey"
    FOREIGN KEY ("user2_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;

ALTER TABLE "public"."dm_messages"
    ADD CONSTRAINT "dm_messages_conversation_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "public"."dm_conversations"("id") ON DELETE CASCADE;

ALTER TABLE "public"."dm_messages"
    ADD CONSTRAINT "dm_messages_sender_fkey"
    FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;

ALTER TABLE "public"."dm_read_receipts"
    ADD CONSTRAINT "dm_read_receipts_conversation_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "public"."dm_conversations"("id") ON DELETE CASCADE;

ALTER TABLE "public"."dm_read_receipts"
    ADD CONSTRAINT "dm_read_receipts_user_fkey"
    FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;

-- --------------------------------------------------------------------------
-- Indexes
-- --------------------------------------------------------------------------

-- Find conversations for a user (user can be user1 or user2)
CREATE INDEX "idx_dm_conversations_user1" ON "public"."dm_conversations" ("user1_id", "last_message_at" DESC);
CREATE INDEX "idx_dm_conversations_user2" ON "public"."dm_conversations" ("user2_id", "last_message_at" DESC);

-- Messages in a conversation, ordered by time
CREATE INDEX "idx_dm_messages_conversation" ON "public"."dm_messages" ("conversation_id", "created_at" DESC, "id" DESC);

-- Sender lookup
CREATE INDEX "idx_dm_messages_sender" ON "public"."dm_messages" ("sender_id");

-- Composite index for unread count queries
CREATE INDEX "idx_dm_messages_unread" ON "public"."dm_messages" ("conversation_id", "sender_id", "deleted_at", "created_at");

-- --------------------------------------------------------------------------
-- Trigger: update last_message_at on new message
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "public"."dm_update_last_message_at"()
    RETURNS "trigger"
    LANGUAGE "plpgsql"
    SECURITY DEFINER
    AS $$
BEGIN
    UPDATE public.dm_conversations
    SET last_message_at = NEW.created_at
    WHERE id = NEW.conversation_id;
    RETURN NULL;
END;
$$;

ALTER FUNCTION "public"."dm_update_last_message_at"() OWNER TO "postgres";

CREATE TRIGGER "dm_messages_update_conversation"
    AFTER INSERT ON "public"."dm_messages"
    FOR EACH ROW
    EXECUTE FUNCTION "public"."dm_update_last_message_at"();

-- --------------------------------------------------------------------------
-- RPC: start or get a conversation (handles ordered pair logic)
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "public"."dm_get_or_create_conversation"(
    "_other_user_id" "uuid"
)
    RETURNS "uuid"
    LANGUAGE "plpgsql"
    SECURITY INVOKER
    AS $$
DECLARE
    _current_user_id uuid := auth.uid();
    _u1 uuid;
    _u2 uuid;
    _conv_id uuid;
BEGIN
    IF _current_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF _current_user_id = _other_user_id THEN
        RAISE EXCEPTION 'Cannot message yourself';
    END IF;

    -- Order the pair
    IF _current_user_id < _other_user_id THEN
        _u1 := _current_user_id;
        _u2 := _other_user_id;
    ELSE
        _u1 := _other_user_id;
        _u2 := _current_user_id;
    END IF;

    -- Try to find existing
    SELECT id INTO _conv_id
    FROM public.dm_conversations
    WHERE user1_id = _u1 AND user2_id = _u2;

    IF _conv_id IS NOT NULL THEN
        RETURN _conv_id;
    END IF;

    -- Create new
    INSERT INTO public.dm_conversations (user1_id, user2_id)
    VALUES (_u1, _u2)
    ON CONFLICT (user1_id, user2_id) DO UPDATE SET user1_id = EXCLUDED.user1_id
    RETURNING id INTO _conv_id;

    RETURN _conv_id;
END;
$$;

ALTER FUNCTION "public"."dm_get_or_create_conversation"("_other_user_id" "uuid") OWNER TO "postgres";

-- --------------------------------------------------------------------------
-- RLS
-- --------------------------------------------------------------------------

ALTER TABLE "public"."dm_conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."dm_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."dm_read_receipts" ENABLE ROW LEVEL SECURITY;

-- dm_conversations: participants only
CREATE POLICY "Users can view own conversations"
    ON "public"."dm_conversations" FOR SELECT
    USING (
        "auth"."uid"() = "user1_id" OR "auth"."uid"() = "user2_id"
    );

CREATE POLICY "Users can insert conversations they participate in"
    ON "public"."dm_conversations" FOR INSERT
    WITH CHECK (
        "auth"."uid"() = "user1_id" OR "auth"."uid"() = "user2_id"
    );

-- No UPDATE policy for authenticated users on dm_conversations.
-- The dm_update_last_message_at trigger is SECURITY DEFINER (runs as postgres),
-- so it bypasses RLS and handles last_message_at updates automatically.

-- dm_messages: participants of the conversation only
CREATE POLICY "Users can read messages in own conversations"
    ON "public"."dm_messages" FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM "public"."dm_conversations"
            WHERE "id" = "conversation_id"
            AND ("user1_id" = "auth"."uid"() OR "user2_id" = "auth"."uid"())
        )
    );

CREATE POLICY "Users can send messages in own conversations"
    ON "public"."dm_messages" FOR INSERT
    WITH CHECK (
        "auth"."uid"() = "sender_id"
        AND EXISTS (
            SELECT 1 FROM "public"."dm_conversations"
            WHERE "id" = "conversation_id"
            AND ("user1_id" = "auth"."uid"() OR "user2_id" = "auth"."uid"())
        )
    );

CREATE POLICY "Users can update own messages"
    ON "public"."dm_messages" FOR UPDATE
    USING ("auth"."uid"() = "sender_id")
    WITH CHECK ("auth"."uid"() = "sender_id");

-- dm_read_receipts: own receipts only
CREATE POLICY "Users can view own read receipts"
    ON "public"."dm_read_receipts" FOR SELECT
    USING ("auth"."uid"() = "user_id");

CREATE POLICY "Users can upsert own read receipts"
    ON "public"."dm_read_receipts" FOR INSERT
    WITH CHECK ("auth"."uid"() = "user_id");

CREATE POLICY "Users can update own read receipts"
    ON "public"."dm_read_receipts" FOR UPDATE
    USING ("auth"."uid"() = "user_id")
    WITH CHECK ("auth"."uid"() = "user_id");

-- Also allow participants to see each other's read receipts (for read indicators)
CREATE POLICY "Participants can view conversation read receipts"
    ON "public"."dm_read_receipts" FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM "public"."dm_conversations"
            WHERE "id" = "conversation_id"
            AND ("user1_id" = "auth"."uid"() OR "user2_id" = "auth"."uid"())
        )
    );

-- --------------------------------------------------------------------------
-- Grants
-- --------------------------------------------------------------------------

GRANT SELECT, INSERT ON TABLE "public"."dm_conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."dm_conversations" TO "service_role";

GRANT SELECT, INSERT, UPDATE ON TABLE "public"."dm_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."dm_messages" TO "service_role";

GRANT SELECT, INSERT, UPDATE ON TABLE "public"."dm_read_receipts" TO "authenticated";
GRANT ALL ON TABLE "public"."dm_read_receipts" TO "service_role";

-- --------------------------------------------------------------------------
-- RPC: batch unread counts (avoids N+1 queries)
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "public"."dm_unread_counts"(
    "_user_id" "uuid"
)
    RETURNS TABLE("conversation_id" "uuid", "unread_count" bigint)
    LANGUAGE "sql"
    STABLE
    SECURITY INVOKER
    AS $$
    SELECT
        m.conversation_id,
        COUNT(*) AS unread_count
    FROM public.dm_messages m
    LEFT JOIN public.dm_read_receipts r
        ON r.conversation_id = m.conversation_id AND r.user_id = _user_id
    WHERE m.conversation_id IN (
        SELECT id FROM public.dm_conversations
        WHERE user1_id = _user_id OR user2_id = _user_id
    )
    AND m.sender_id != _user_id
    AND m.deleted_at IS NULL
    AND (r.last_read_at IS NULL OR m.created_at > r.last_read_at)
    GROUP BY m.conversation_id;
$$;

ALTER FUNCTION "public"."dm_unread_counts"("_user_id" "uuid") OWNER TO "postgres";

-- --------------------------------------------------------------------------
-- Enable Realtime for DM tables
-- --------------------------------------------------------------------------

ALTER PUBLICATION supabase_realtime ADD TABLE "public"."dm_conversations";
ALTER PUBLICATION supabase_realtime ADD TABLE "public"."dm_messages";
ALTER PUBLICATION supabase_realtime ADD TABLE "public"."dm_read_receipts";
```

- [ ] **Step 2: Test migration locally**

Run: `npx supabase db reset`
Expected: Migration applies cleanly, all three tables exist.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260402000002_dm_tables.sql
git commit -m "feat(dm): add database tables, RLS, and realtime for direct messaging"
```

---

### Task 2: TypeScript Types & Zod Schemas

**Files:**
- Modify: `src/types/database.ts` (append after line 138)
- Create: `src/lib/validations/messages.ts`

- [ ] **Step 1: Add TypeScript types**

Append to `src/types/database.ts`:

```typescript
// ---------------------------------------------------------------------------
// Direct Messages
// ---------------------------------------------------------------------------

export interface DmConversation {
  id: string;
  user1_id: string;
  user2_id: string;
  last_message_at: string;
  created_at: string;
}

export interface DmConversationWithParticipant extends DmConversation {
  participant: Pick<Profile, "id" | "display_name" | "avatar_url"> | null;
  unread_count: number;
}

export interface DmMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  body_format: "text" | "html";
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DmMessageWithSender extends DmMessage {
  sender: Pick<Profile, "id" | "display_name" | "avatar_url"> | null;
}

export interface DmReadReceipt {
  conversation_id: string;
  user_id: string;
  last_read_at: string;
}
```

- [ ] **Step 2: Create Zod schemas**

Create `src/lib/validations/messages.ts`:

```typescript
import { z } from "zod/v4";

export const sendMessageSchema = z.object({
  conversationId: z.string().uuid("Invalid conversation ID"),
  body: z
    .string()
    .min(1, "Message is required")
    .max(5000, "Message must be under 5,000 characters"),
  bodyFormat: z.enum(["text", "html"]).default("html"),
});

export const editMessageSchema = z.object({
  messageId: z.string().uuid("Invalid message ID"),
  body: z
    .string()
    .min(1, "Message is required")
    .max(5000, "Message must be under 5,000 characters"),
  bodyFormat: z.enum(["text", "html"]).default("html"),
});

export const startConversationSchema = z.object({
  recipientId: z.string().uuid("Invalid user ID"),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type EditMessageInput = z.infer<typeof editMessageSchema>;
export type StartConversationInput = z.infer<typeof startConversationSchema>;
```

- [ ] **Step 3: Commit**

```bash
git add src/types/database.ts src/lib/validations/messages.ts
git commit -m "feat(dm): add TypeScript types and Zod validation schemas"
```

---

### Task 3: Server-Side Data Fetchers

**Files:**
- Create: `src/lib/data/messages.ts`

- [ ] **Step 1: Create data fetchers**

Create `src/lib/data/messages.ts`:

```typescript
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/data/auth";
import type {
  DmConversationWithParticipant,
  DmMessageWithSender,
  DmReadReceipt,
  Profile,
} from "@/types/database";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UnreadCounts {
  /** Map of conversationId → unread count */
  byConversation: Record<string, number>;
  /** Total unread across all conversations */
  total: number;
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

export const getConversations = cache(async function getConversations(): Promise<
  DmConversationWithParticipant[]
> {
  const user = await getAuthUser();
  if (!user) return [];

  const supabase = await createClient();

  // Fetch conversations where user is a participant
  const { data, error } = await supabase
    .from("dm_conversations")
    .select("*")
    .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
    .order("last_message_at", { ascending: false })
    .limit(30);

  if (error) throw new Error(`Failed to fetch conversations: ${error.message}`);

  if (!data || data.length === 0) return [];

  // Get the other participant's profile for each conversation
  const otherUserIds = data.map((c) =>
    c.user1_id === user.id ? c.user2_id : c.user1_id,
  );

  const uniqueIds = [...new Set(otherUserIds)];

  // Fetch profiles and unread counts in parallel (single RPC, no N+1)
  const [{ data: profiles, error: profilesError }, { data: unreadRows, error: unreadError }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", uniqueIds),
      supabase.rpc("dm_unread_counts", { _user_id: user.id }),
    ]);

  if (profilesError) throw new Error(`Failed to fetch profiles: ${profilesError.message}`);
  if (unreadError) throw new Error(`Failed to fetch unread counts: ${unreadError.message}`);

  const profileMap = new Map(
    (profiles ?? []).map((p) => [p.id, p as Pick<Profile, "id" | "display_name" | "avatar_url">]),
  );

  const unreadMap = new Map(
    (unreadRows ?? []).map((r: { conversation_id: string; unread_count: number }) => [
      r.conversation_id,
      r.unread_count,
    ]),
  );

  return data.map((c) => {
    const otherId = c.user1_id === user.id ? c.user2_id : c.user1_id;
    return {
      ...c,
      participant: profileMap.get(otherId) ?? null,
      unread_count: unreadMap.get(c.id) ?? 0,
    };
  });
});

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

const MESSAGES_PAGE_SIZE = 50;

export const getMessages = cache(async function getMessages(
  conversationId: string,
): Promise<DmMessageWithSender[]> {
  const user = await getAuthUser();
  if (!user) return [];

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("dm_messages")
    .select("*, profiles!dm_messages_sender_fkey(id, display_name, avatar_url)")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(MESSAGES_PAGE_SIZE);

  if (error) throw new Error(`Failed to fetch messages: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    conversation_id: row.conversation_id,
    sender_id: row.sender_id,
    body: row.body,
    body_format: row.body_format as "text" | "html",
    edited_at: row.edited_at,
    deleted_at: row.deleted_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    sender: (row.profiles as Pick<Profile, "id" | "display_name" | "avatar_url">) ?? null,
  }));
});

// ---------------------------------------------------------------------------
// Conversation detail (for verifying access)
// ---------------------------------------------------------------------------

export const getConversation = cache(async function getConversation(
  conversationId: string,
) {
  const user = await getAuthUser();
  if (!user) return null;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("dm_conversations")
    .select("*")
    .eq("id", conversationId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`Failed to fetch conversation: ${error.message}`);
  }

  // RLS should handle this, but double-check
  if (data.user1_id !== user.id && data.user2_id !== user.id) return null;

  // Get other participant's profile
  const otherId = data.user1_id === user.id ? data.user2_id : data.user1_id;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url")
    .eq("id", otherId)
    .single();

  return {
    ...data,
    participant: profile as Pick<Profile, "id" | "display_name" | "avatar_url"> | null,
  };
});

// ---------------------------------------------------------------------------
// Unread counts (single RPC call — no N+1)
// ---------------------------------------------------------------------------

export const getUnreadCounts = cache(async function getUnreadCounts(): Promise<UnreadCounts> {
  const user = await getAuthUser();
  if (!user) return { byConversation: {}, total: 0 };

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("dm_unread_counts", {
    _user_id: user.id,
  });

  if (error) throw new Error(`Failed to fetch unread counts: ${error.message}`);

  const byConversation: Record<string, number> = {};
  let total = 0;

  for (const row of data ?? []) {
    byConversation[row.conversation_id] = row.unread_count;
    total += row.unread_count;
  }

  return { byConversation, total };
});
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/data/messages.ts
git commit -m "feat(dm): add server-side data fetchers for conversations and messages"
```

---

### Task 4: Server Actions

**Files:**
- Create: `src/app/(marketing)/community/messages/actions.ts`

- [ ] **Step 1: Create server actions**

Create `src/app/(marketing)/community/messages/actions.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/data/auth";
import { validateUUID } from "@/lib/validation-helpers";
import { sanitizeBody } from "@/lib/community/sanitize";
import {
  sendMessageSchema,
  editMessageSchema,
  startConversationSchema,
} from "@/lib/validations/messages";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DmActionState = {
  errors: Record<string, string> | null;
  message: string;
  success: boolean;
  resetKey: number;
};

// ---------------------------------------------------------------------------
// Send message (useActionState pattern)
// ---------------------------------------------------------------------------

export async function sendMessage(
  prevState: DmActionState,
  formData: FormData,
): Promise<DmActionState> {
  const user = await getAuthUser();
  if (!user) {
    return { errors: null, message: "You must be logged in to send messages.", success: false, resetKey: prevState.resetKey };
  }

  const raw = {
    conversationId: formData.get("conversationId") as string,
    body: formData.get("body") as string,
    bodyFormat: (formData.get("bodyFormat") as string) || "html",
  };

  const parsed = sendMessageSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0]);
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { errors: fieldErrors, message: "", success: false, resetKey: prevState.resetKey };
  }

  const { conversationId, body, bodyFormat } = parsed.data;
  const sanitizedBody = bodyFormat === "html" ? sanitizeBody(body) : body;

  // Check that body has actual visible content (not just empty HTML tags like <p></p>)
  const textContent = sanitizedBody.replace(/<[^>]*>/g, "").trim();
  if (!textContent) {
    return { errors: { body: "Message is required" }, message: "", success: false, resetKey: prevState.resetKey };
  }

  const supabase = await createClient();

  // Verify user is a participant (RLS does this too, but fail with a clear message)
  const { data: conv, error: convError } = await supabase
    .from("dm_conversations")
    .select("id")
    .eq("id", conversationId)
    .single();

  if (convError || !conv) {
    return { errors: null, message: "Conversation not found.", success: false, resetKey: prevState.resetKey };
  }

  const { error } = await supabase.from("dm_messages").insert({
    conversation_id: conversationId,
    sender_id: user.id,
    body: sanitizedBody,
    body_format: bodyFormat,
  });

  if (error) {
    return { errors: null, message: `Failed to send message: ${error.message}`, success: false, resetKey: prevState.resetKey };
  }

  revalidatePath(`/community/messages/${conversationId}`);
  return { errors: null, message: "", success: true, resetKey: prevState.resetKey + 1 };
}

// ---------------------------------------------------------------------------
// Edit message (imperative — called directly, throws on error)
// ---------------------------------------------------------------------------

export async function editMessage(messageId: string, body: string, bodyFormat: "text" | "html" = "html"): Promise<void> {
  validateUUID(messageId, "message");

  const parsed = editMessageSchema.safeParse({ messageId, body, bodyFormat });
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);

  const user = await getAuthUser();
  if (!user) throw new Error("Not authenticated");

  const sanitizedBody = bodyFormat === "html" ? sanitizeBody(body) : body;
  const supabase = await createClient();

  const { data: msg, error: fetchError } = await supabase
    .from("dm_messages")
    .select("sender_id, conversation_id")
    .eq("id", messageId)
    .single();

  if (fetchError || !msg) throw new Error("Message not found");
  if (msg.sender_id !== user.id) throw new Error("You can only edit your own messages");

  const { error } = await supabase
    .from("dm_messages")
    .update({
      body: sanitizedBody,
      body_format: bodyFormat,
      edited_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", messageId);

  if (error) throw new Error(`Failed to edit message: ${error.message}`);

  revalidatePath(`/community/messages/${msg.conversation_id}`);
}

// ---------------------------------------------------------------------------
// Delete message (soft delete)
// ---------------------------------------------------------------------------

export async function deleteMessage(messageId: string): Promise<void> {
  validateUUID(messageId, "message");

  const user = await getAuthUser();
  if (!user) throw new Error("Not authenticated");

  const supabase = await createClient();

  const { data: msg, error: fetchError } = await supabase
    .from("dm_messages")
    .select("sender_id, conversation_id")
    .eq("id", messageId)
    .single();

  if (fetchError || !msg) throw new Error("Message not found");
  if (msg.sender_id !== user.id) throw new Error("You can only delete your own messages");

  const { error } = await supabase
    .from("dm_messages")
    .update({
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", messageId);

  if (error) throw new Error(`Failed to delete message: ${error.message}`);

  revalidatePath(`/community/messages/${msg.conversation_id}`);
}

// ---------------------------------------------------------------------------
// Mark conversation as read
// ---------------------------------------------------------------------------

export async function markAsRead(conversationId: string): Promise<void> {
  validateUUID(conversationId, "conversation");

  const user = await getAuthUser();
  if (!user) throw new Error("Not authenticated");

  const supabase = await createClient();

  const { error } = await supabase
    .from("dm_read_receipts")
    .upsert(
      {
        conversation_id: conversationId,
        user_id: user.id,
        last_read_at: new Date().toISOString(),
      },
      { onConflict: "conversation_id,user_id" },
    );

  if (error) throw new Error(`Failed to mark as read: ${error.message}`);

  revalidatePath("/community/messages");
}

// ---------------------------------------------------------------------------
// Start conversation (find or create, then redirect)
// ---------------------------------------------------------------------------

export async function startConversation(
  prevState: DmActionState,
  formData: FormData,
): Promise<DmActionState> {
  const user = await getAuthUser();
  if (!user) {
    return { errors: null, message: "You must be logged in.", success: false, resetKey: prevState.resetKey };
  }

  const raw = { recipientId: formData.get("recipientId") as string };
  const parsed = startConversationSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: { recipientId: parsed.error.issues[0].message }, message: "", success: false, resetKey: prevState.resetKey };
  }

  if (parsed.data.recipientId === user.id) {
    return { errors: null, message: "You cannot message yourself.", success: false, resetKey: prevState.resetKey };
  }

  const supabase = await createClient();

  const { data: convId, error } = await supabase.rpc("dm_get_or_create_conversation", {
    _other_user_id: parsed.data.recipientId,
  });

  if (error) {
    return { errors: null, message: `Failed to start conversation: ${error.message}`, success: false, resetKey: prevState.resetKey };
  }

  revalidatePath("/community/messages");
  redirect(`/community/messages/${convId}`);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\(marketing\)/community/messages/actions.ts
git commit -m "feat(dm): add server actions for send, edit, delete, mark-read, start-conversation"
```

---

### Task 5: Message Composer (TipTap)

**Files:**
- Create: `src/components/community/MessageComposer.tsx`

- [ ] **Step 1: Create the MessageComposer component**

This is a stripped-down version of `RichTextEditor.tsx` with only bold, italic, and link. It submits via form action (hidden input pattern) and clears on successful send.

Create `src/components/community/MessageComposer.tsx`:

```typescript
"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { useRef, useActionState } from "react";
import { cn } from "@/lib/utils";
import { Bold, Italic, Link as LinkIcon, Send } from "lucide-react";
import { sendMessage, type DmActionState } from "@/app/(marketing)/community/messages/actions";

interface MessageComposerProps {
  conversationId: string;
}

const initialState: DmActionState = {
  errors: null,
  message: "",
  success: false,
  resetKey: 0,
};

export function MessageComposer({ conversationId }: MessageComposerProps) {
  const hiddenRef = useRef<HTMLInputElement>(null);
  const [state, formAction, isPending] = useActionState(sendMessage, initialState);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-primary underline underline-offset-4",
        },
      }),
      Placeholder.configure({
        placeholder: "Type a message...",
      }),
    ],
    editorProps: {
      attributes: {
        class: "min-h-[2.5rem] max-h-[10rem] overflow-y-auto w-full px-3 py-2 text-sm text-foreground focus:outline-none",
      },
    },
    onUpdate({ editor: e }) {
      if (hiddenRef.current) {
        hiddenRef.current.value = e.isEmpty ? "" : e.getHTML();
      }
    },
  });

  // Clear editor on successful send (previous-value-in-state pattern)
  const prevResetKeyRef = useRef(0);
  if (state.success && state.resetKey !== prevResetKeyRef.current) {
    prevResetKeyRef.current = state.resetKey;
    editor?.commands.clearContent();
    if (hiddenRef.current) hiddenRef.current.value = "";
  }

  function addLink() {
    if (!editor) return;
    const url = prompt("Enter URL:");
    if (!url) return;
    editor.chain().focus().setLink({ href: url }).run();
  }

  const btn = (active: boolean) =>
    cn(
      "rounded p-1.5 transition-colors",
      active
        ? "bg-primary/10 text-primary"
        : "text-muted-foreground hover:bg-muted hover:text-foreground",
    );

  return (
    <form action={formAction} className="border-t border-border bg-card px-4 py-3">
      <input type="hidden" name="conversationId" value={conversationId} />
      <input ref={hiddenRef} type="hidden" name="body" />
      <input type="hidden" name="bodyFormat" value="html" />

      <div className="rounded-lg border border-border bg-background">
        {editor && (
          <div className="flex items-center gap-0.5 border-b border-border px-2 py-1">
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleBold().run()}
              className={btn(editor.isActive("bold"))}
              title="Bold"
            >
              <Bold className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleItalic().run()}
              className={btn(editor.isActive("italic"))}
              title="Italic"
            >
              <Italic className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={addLink}
              className={btn(editor.isActive("link"))}
              title="Add link"
            >
              <LinkIcon className="h-3.5 w-3.5" />
            </button>

            <div className="ml-auto">
              <button
                type="submit"
                disabled={isPending}
                className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                title="Send message"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
        <EditorContent editor={editor} />
      </div>

      {state.message && !state.success && (
        <p className="mt-1 text-xs text-destructive">{state.message}</p>
      )}
      {state.errors?.body && (
        <p className="mt-1 text-xs text-destructive">{state.errors.body}</p>
      )}
    </form>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/community/MessageComposer.tsx
git commit -m "feat(dm): add MessageComposer with TipTap (bold, italic, link)"
```

---

### Task 6: Message Bubble Component

**Files:**
- Create: `src/components/community/MessageBubble.tsx`

- [ ] **Step 1: Create the MessageBubble component**

Create `src/components/community/MessageBubble.tsx`:

```typescript
"use client";

import { useState } from "react";
import { Pencil, Trash2, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { editMessage, deleteMessage } from "@/app/(marketing)/community/messages/actions";
import type { DmMessageWithSender } from "@/types/database";

interface MessageBubbleProps {
  message: DmMessageWithSender;
  isOwn: boolean;
}

export function MessageBubble({ message, isOwn }: MessageBubbleProps) {
  const [showActions, setShowActions] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editBody, setEditBody] = useState(message.body);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isDeleted = message.deleted_at !== null;

  const initials = (message.sender?.display_name || "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const time = new Date(message.created_at).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  async function handleEdit() {
    if (!editBody.trim()) return;
    setIsSubmitting(true);
    try {
      await editMessage(message.id, editBody, message.body_format as "text" | "html");
      setIsEditing(false);
    } catch {
      // Error handled by the action
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    setIsSubmitting(true);
    try {
      await deleteMessage(message.id);
    } catch {
      // Error handled by the action
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isDeleted) {
    return (
      <div className={cn("flex gap-2 px-4 py-1", isOwn && "flex-row-reverse")}>
        <p className="text-xs italic text-muted-foreground">This message was deleted</p>
      </div>
    );
  }

  return (
    <div
      className={cn("group flex gap-2 px-4 py-1", isOwn && "flex-row-reverse")}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Avatar (only for received messages) */}
      {!isOwn && (
        <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-medium text-primary">
          {initials}
        </div>
      )}

      <div className={cn("max-w-[70%]", isOwn && "items-end")}>
        {/* Meta */}
        <div className={cn("mb-0.5 flex items-center gap-1 text-[11px] text-muted-foreground", isOwn && "justify-end")}>
          {!isOwn && <span>{message.sender?.display_name || "Unknown"}</span>}
          <span>{time}</span>
          {message.edited_at && <span>(edited)</span>}
        </div>

        {/* Bubble */}
        {isEditing ? (
          <div className="rounded-lg border border-border bg-background p-2">
            <textarea
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              className="w-full resize-none bg-transparent text-sm text-foreground focus:outline-none"
              rows={2}
              autoFocus
            />
            <div className="mt-1 flex justify-end gap-1">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="rounded px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleEdit}
                className="rounded bg-primary px-2 py-0.5 text-xs text-primary-foreground disabled:opacity-50"
                disabled={isSubmitting}
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <div
            className={cn(
              "rounded-xl px-3 py-2 text-sm",
              isOwn
                ? "rounded-tr-sm bg-primary text-primary-foreground"
                : "rounded-tl-sm bg-muted text-foreground",
            )}
          >
            {message.body_format === "html" ? (
              <div
                className="prose-community [&_p]:m-0"
                dangerouslySetInnerHTML={{ __html: message.body }}
              />
            ) : (
              <p className="m-0 whitespace-pre-wrap">{message.body}</p>
            )}
          </div>
        )}
      </div>

      {/* Actions menu (own messages only) */}
      {isOwn && showActions && !isEditing && (
        <div className="flex items-start gap-0.5 pt-4">
          <button
            type="button"
            onClick={() => {
              setEditBody(message.body);
              setIsEditing(true);
            }}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Edit"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            title="Delete"
            disabled={isSubmitting}
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/community/MessageBubble.tsx
git commit -m "feat(dm): add MessageBubble with edit/delete actions"
```

---

### Task 7: Message Thread (Real-Time)

**Files:**
- Create: `src/components/community/MessageThread.tsx`

- [ ] **Step 1: Create the MessageThread component**

This is a client component that renders the message list and subscribes to real-time updates for the active conversation.

Create `src/components/community/MessageThread.tsx`:

```typescript
"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { MessageBubble } from "./MessageBubble";
import { markAsRead } from "@/app/(marketing)/community/messages/actions";
import type { DmMessageWithSender, Profile } from "@/types/database";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface MessageThreadProps {
  conversationId: string;
  currentUserId: string;
  initialMessages: DmMessageWithSender[];
}

export function MessageThread({
  conversationId,
  currentUserId,
  initialMessages,
}: MessageThreadProps) {
  const [messages, setMessages] = useState<DmMessageWithSender[]>(initialMessages);
  const scrollRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);

  function getSupabase() {
    if (!supabaseRef.current) supabaseRef.current = createClient();
    return supabaseRef.current;
  }

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  // Mark conversation as read on mount
  useEffect(() => {
    markAsRead(conversationId);
  }, [conversationId]);

  // Subscribe to real-time messages
  useEffect(() => {
    const supabase = getSupabase();

    const channel = supabase
      .channel(`dm:messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "dm_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const newMsg = payload.new as DmMessageWithSender;

          // Fetch sender profile if not current user
          if (newMsg.sender_id !== currentUserId) {
            const { data: profile } = await supabase
              .from("profiles")
              .select("id, display_name, avatar_url")
              .eq("id", newMsg.sender_id)
              .single();

            newMsg.sender = (profile as Pick<Profile, "id" | "display_name" | "avatar_url">) ?? null;

            // Mark as read since we're viewing this conversation
            markAsRead(conversationId);
          } else {
            // Own message — we already know our profile
            newMsg.sender = null; // Will be rendered as "own" message
          }

          setMessages((prev) => {
            // Prevent duplicates (action might have already added it via revalidation)
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "dm_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const updated = payload.new as DmMessageWithSender;
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== updated.id) return m;
              // Preserve the sender profile from the existing message
              return { ...updated, sender: m.sender };
            }),
          );
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, currentUserId]);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto py-4">
      {messages.length === 0 ? (
        <div className="flex h-full items-center justify-center">
          <p className="text-sm text-muted-foreground">
            No messages yet. Start the conversation!
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              isOwn={msg.sender_id === currentUserId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/community/MessageThread.tsx
git commit -m "feat(dm): add MessageThread with real-time subscription"
```

---

### Task 8: Messages Sidebar

**Files:**
- Create: `src/components/community/MessagesSidebar.tsx`

- [ ] **Step 1: Create the MessagesSidebar component**

This is a client component that shows conversation list with unread badges and inline user search.

Create `src/components/community/MessagesSidebar.tsx`:

```typescript
"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { DmConversationWithParticipant } from "@/types/database";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface MessagesSidebarProps {
  currentUserId: string;
}

interface SearchResult {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface SidebarConversation {
  id: string;
  user1_id: string;
  user2_id: string;
  last_message_at: string;
  participant: { id: string; display_name: string | null; avatar_url: string | null } | null;
  unread_count: number;
}

export function MessagesSidebar({ currentUserId }: MessagesSidebarProps) {
  const pathname = usePathname();
  const [conversations, setConversations] = useState<SidebarConversation[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);

  function getSupabase() {
    if (!supabaseRef.current) supabaseRef.current = createClient();
    return supabaseRef.current;
  }

  // Fetch conversations on mount (avoids blocking the community layout)
  useEffect(() => {
    async function loadConversations() {
      const supabase = getSupabase();

      const { data: convs } = await supabase
        .from("dm_conversations")
        .select("*")
        .or(`user1_id.eq.${currentUserId},user2_id.eq.${currentUserId}`)
        .order("last_message_at", { ascending: false })
        .limit(30);

      if (!convs || convs.length === 0) {
        setIsLoaded(true);
        return;
      }

      // Get other participants' profiles
      const otherIds = [...new Set(convs.map((c) =>
        c.user1_id === currentUserId ? c.user2_id : c.user1_id,
      ))];

      const [{ data: profiles }, { data: unreadRows }] = await Promise.all([
        supabase.from("profiles").select("id, display_name, avatar_url").in("id", otherIds),
        supabase.rpc("dm_unread_counts", { _user_id: currentUserId }),
      ]);

      const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
      const unreadMap = new Map((unreadRows ?? []).map((r: { conversation_id: string; unread_count: number }) => [r.conversation_id, r.unread_count]));

      setConversations(convs.map((c) => {
        const otherId = c.user1_id === currentUserId ? c.user2_id : c.user1_id;
        return {
          ...c,
          participant: profileMap.get(otherId) ?? null,
          unread_count: unreadMap.get(c.id) ?? 0,
        };
      }));
      setIsLoaded(true);
    }

    loadConversations();
  }, [currentUserId]);

  // Real-time: update conversation order when last_message_at changes
  // Note: We only subscribe to dm_conversations (filtered by user participation via RLS)
  // and dm_read_receipts. We do NOT subscribe to dm_messages globally — that would
  // cause O(users * messages) RLS evaluations. Instead, new message counts are
  // derived from conversation updates (the trigger updates last_message_at on each send).
  useEffect(() => {
    const supabase = getSupabase();

    const channel = supabase
      .channel(`dm:sidebar:${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "dm_conversations",
        },
        (payload) => {
          const updated = payload.new as { id: string; last_message_at: string };
          setConversations((prev) => {
            const next = prev.map((c) =>
              c.id === updated.id
                ? { ...c, last_message_at: updated.last_message_at, unread_count: c.unread_count + 1 }
                : c,
            );
            // Re-sort by last_message_at descending
            return next.sort((a, b) =>
              new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime(),
            );
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "dm_read_receipts",
          filter: `user_id=eq.${currentUserId}`,
        },
        (payload) => {
          // Clear unread count when user reads a conversation
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            const receipt = payload.new as { conversation_id: string };
            setConversations((prev) =>
              prev.map((c) =>
                c.id === receipt.conversation_id
                  ? { ...c, unread_count: 0 }
                  : c,
              ),
            );
          }
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  // Debounced user search
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/community/mention-search?q=${encodeURIComponent(searchQuery)}`,
        );
        if (res.ok) {
          const data = await res.json();
          // Filter out current user and existing conversation partners
          const existingPartnerIds = new Set(
            conversations.map((c) => c.participant?.id).filter(Boolean),
          );
          setSearchResults(
            (data as SearchResult[]).filter(
              (u) => u.id !== currentUserId && !existingPartnerIds.has(u.id),
            ),
          );
        }
      } catch {
        // Silently fail search
      } finally {
        setIsSearching(false);
      }
    }, 200);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchQuery, currentUserId, conversations]);

  function getInitials(name: string | null): string {
    return (name || "?")
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between px-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Messages
        </h2>
        {!showSearch && (
          <button
            type="button"
            onClick={() => setShowSearch(true)}
            className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
            title="New message"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Inline search */}
      {showSearch && (
        <div className="mb-2 px-1">
          <div className="flex items-center gap-1">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search users..."
                className="h-8 w-full rounded-md border border-border bg-background pl-7 pr-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                autoFocus
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setShowSearch(false);
                setSearchQuery("");
                setSearchResults([]);
              }}
              className="rounded p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Search results */}
          {searchResults.length > 0 && (
            <div className="mt-1 rounded-md border border-border bg-background py-1">
              {searchResults.map((user) => (
                <Link
                  key={user.id}
                  href={`/community/messages?start=${user.id}`}
                  onClick={() => {
                    setShowSearch(false);
                    setSearchQuery("");
                    setSearchResults([]);
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-accent"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-medium text-primary">
                    {getInitials(user.display_name)}
                  </span>
                  <span className="truncate">{user.display_name || "Unknown"}</span>
                </Link>
              ))}
            </div>
          )}

          {searchQuery.length >= 2 && searchResults.length === 0 && !isSearching && (
            <p className="mt-1 px-2 text-xs text-muted-foreground">No users found</p>
          )}
        </div>
      )}

      {/* Conversation list */}
      <nav className="flex flex-col gap-0.5">
        {conversations.map((conv) => {
          const isActive = pathname === `/community/messages/${conv.id}`;
          return (
            <Link
              key={conv.id}
              href={`/community/messages/${conv.id}`}
              className={cn(
                "flex items-center justify-between rounded-md px-3 py-1.5 text-sm transition-colors",
                isActive
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <span className="flex items-center gap-2 truncate">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-medium text-primary">
                  {getInitials(conv.participant?.display_name ?? null)}
                </span>
                <span className="truncate">{conv.participant?.display_name || "Unknown"}</span>
              </span>

              {conv.unread_count > 0 && (
                <span className="ml-1 flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">
                  {conv.unread_count > 99 ? "99+" : conv.unread_count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {conversations.length === 0 && !showSearch && (
        <p className="px-3 text-xs text-muted-foreground">
          No conversations yet
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/community/MessagesSidebar.tsx
git commit -m "feat(dm): add MessagesSidebar with conversation list and user search"
```

---

### Task 9: Chat View Pages

**Files:**
- Create: `src/app/(marketing)/community/messages/page.tsx`
- Create: `src/app/(marketing)/community/messages/[conversationId]/page.tsx`

- [ ] **Step 1: Create empty state page**

Create `src/app/(marketing)/community/messages/page.tsx`:

```typescript
import { MessageSquare } from "lucide-react";

export default function MessagesPage() {
  return (
    <div className="flex h-[60vh] flex-col items-center justify-center text-center">
      <MessageSquare className="mb-3 h-10 w-10 text-muted-foreground" />
      <h2 className="text-lg font-semibold text-foreground">Your messages</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Select a conversation from the sidebar or start a new one
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Create conversation view page**

Create `src/app/(marketing)/community/messages/[conversationId]/page.tsx`:

```typescript
import { notFound } from "next/navigation";
import { getAuthUser } from "@/lib/data/auth";
import { getConversation, getMessages } from "@/lib/data/messages";
import { MessageThread } from "@/components/community/MessageThread";
import { MessageComposer } from "@/components/community/MessageComposer";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;

  const [user, conversation, messages] = await Promise.all([
    getAuthUser(),
    getConversation(conversationId),
    getMessages(conversationId),
  ]);

  if (!user || !conversation) notFound();

  return (
    <div className="flex h-[calc(100vh-12rem)] flex-col rounded-xl bg-card ring-1 ring-foreground/10">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-medium text-primary">
          {(conversation.participant?.display_name || "?")
            .split(" ")
            .map((n) => n[0])
            .join("")
            .toUpperCase()
            .slice(0, 2)}
        </span>
        <h2 className="text-sm font-semibold text-foreground">
          {conversation.participant?.display_name || "Unknown user"}
        </h2>
      </div>

      {/* Messages */}
      <MessageThread
        conversationId={conversationId}
        currentUserId={user.id}
        initialMessages={messages}
      />

      {/* Composer */}
      <MessageComposer conversationId={conversationId} />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/\(marketing\)/community/messages/page.tsx src/app/\(marketing\)/community/messages/\[conversationId\]/page.tsx
git commit -m "feat(dm): add messages page and conversation view"
```

---

### Task 10: Integrate Sidebar & Layout

**Files:**
- Modify: `src/components/community/ChannelSidebar.tsx`
- Modify: `src/app/(marketing)/community/layout.tsx`

- [ ] **Step 1: Add MessagesSidebar to ChannelSidebar**

In `src/components/community/ChannelSidebar.tsx`, add the import and render `MessagesSidebar` below the channel list:

Add import at top:
```typescript
import { MessagesSidebar } from "./MessagesSidebar";
import type { DmConversationWithParticipant } from "@/types/database";
```

Update the interface to accept the current user ID:
```typescript
interface ChannelSidebarProps {
  topics: ForumTopic[];
  isAuthenticated: boolean;
  isAdmin: boolean;
  currentUserId: string | null;
}
```

Update the component signature:
```typescript
export function ChannelSidebar({ topics, isAuthenticated, isAdmin, currentUserId }: ChannelSidebarProps) {
```

Add the Messages section between the channel list `</div>` (closing tag of channel list div, line 126) and the "New post button" section:

```tsx
        {/* Messages section — fetches its own data to avoid blocking community pages */}
        {isAuthenticated && currentUserId && (
          <>
            <div className="border-t border-border" />
            <MessagesSidebar currentUserId={currentUserId} />
          </>
        )}
```

- [ ] **Step 2: Update community layout to fetch conversations**

In `src/app/(marketing)/community/layout.tsx`, pass `currentUserId` to the sidebar (no DM data fetching here — the `MessagesSidebar` client component fetches its own data to avoid blocking all community pages):

```typescript
import { getAuthUser } from "@/lib/data/auth";
import { getProfile } from "@/lib/data/profiles";
import { getForumTopics } from "@/lib/data/forum";
import { ChannelSidebar } from "@/components/community/ChannelSidebar";

export default async function CommunityLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, profile, topics] = await Promise.all([
    getAuthUser(),
    getProfile(),
    getForumTopics(),
  ]);

  const isAdmin = profile?.role === "admin";

  return (
    <div className="min-h-screen bg-muted px-4 pt-20 pb-12">
      <div className="mx-auto flex max-w-6xl gap-6">
        <ChannelSidebar
          topics={topics}
          isAuthenticated={!!user}
          isAdmin={isAdmin}
          currentUserId={user?.id ?? null}
        />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/community/ChannelSidebar.tsx src/app/\(marketing\)/community/layout.tsx
git commit -m "feat(dm): integrate messages sidebar into community layout"
```

---

### Task 11: Navbar Unread Badge

**Files:**
- Create: `src/components/layout/UnreadBadge.tsx`
- Modify: `src/components/layout/Navbar.tsx`

- [ ] **Step 1: Create UnreadBadge component**

Create `src/components/layout/UnreadBadge.tsx`:

```typescript
"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface UnreadBadgeProps {
  initialCount: number;
  userId: string;
  variant?: "light" | "dark";
}

export function UnreadBadge({ initialCount, userId, variant = "dark" }: UnreadBadgeProps) {
  const [count, setCount] = useState(initialCount);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);

  function getSupabase() {
    if (!supabaseRef.current) supabaseRef.current = createClient();
    return supabaseRef.current;
  }

  // Fetch actual count on mount (initialCount is 0, this corrects it quickly)
  useEffect(() => {
    async function fetchCount() {
      const supabase = getSupabase();
      const { data } = await supabase.rpc("dm_unread_counts", { _user_id: userId });
      if (data) {
        const total = (data as { unread_count: number }[]).reduce((sum, r) => sum + r.unread_count, 0);
        setCount(total);
      }
    }
    fetchCount();
  }, [userId]);

  // Real-time: listen for conversation updates (triggered by new messages)
  // and read receipts. On any change, re-fetch the actual count to stay accurate.
  useEffect(() => {
    const supabase = getSupabase();

    async function refetchCount() {
      const { data } = await supabase.rpc("dm_unread_counts", { _user_id: userId });
      if (data) {
        const total = (data as { unread_count: number }[]).reduce((sum, r) => sum + r.unread_count, 0);
        setCount(total);
      }
    }

    const channel = supabase
      .channel(`dm:unread:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "dm_conversations",
        },
        () => refetchCount(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "dm_read_receipts",
          filter: `user_id=eq.${userId}`,
        },
        () => refetchCount(),
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const isLight = variant === "light";

  return (
    <Link
      href="/community/messages"
      className="relative inline-flex items-center justify-center rounded-full p-1.5 transition-opacity hover:opacity-75"
      title="Messages"
    >
      <Mail className={`h-5 w-5 ${isLight ? "text-foreground" : "text-white"}`} />
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
```

- [ ] **Step 2: Add envelope icon to Navbar**

In `src/components/layout/Navbar.tsx`, the `AuthButtons` component already handles user state. We need to add the `UnreadBadge` next to `AuthButtons`. Since the Navbar doesn't have access to server data (it's a client component), we need to pass the unread count from a parent.

The simplest approach: import `UnreadBadge` into `AuthButtons.tsx` since it already has the user state and Supabase client.

Modify `src/components/layout/AuthButtons.tsx` — add the `UnreadBadge` import and render it when the user is logged in:

Add import at top:
```typescript
import { UnreadBadge } from "./UnreadBadge";
```

In the return block where user is authenticated (before the profile link, around line 144), add:

```tsx
    <div className="flex items-center gap-3">
      <UnreadBadge initialCount={0} userId={user.id} variant={variant} />
      {user.role === "admin" && (
```

Note: `initialCount={0}` — the real count will be picked up via the real-time subscription. The next page navigation will revalidate to show the correct count. This is acceptable for the navbar badge since it self-corrects quickly.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/UnreadBadge.tsx src/components/layout/AuthButtons.tsx
git commit -m "feat(dm): add navbar unread badge with real-time updates"
```

---

### Task 12: Handle New Conversation from Search

**Files:**
- Modify: `src/app/(marketing)/community/messages/page.tsx`

- [ ] **Step 1: Update messages page to handle `?start=` parameter**

When a user clicks a search result in the sidebar, we need to find-or-create the conversation and redirect. Update `src/app/(marketing)/community/messages/page.tsx`:

```typescript
import { redirect } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { getAuthUser } from "@/lib/data/auth";
import { createClient } from "@/lib/supabase/server";
import { isUUID } from "@/lib/validation-helpers";

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { start } = await searchParams;

  // If ?start=userId is present, create/find conversation and redirect
  if (typeof start === "string" && isUUID(start)) {
    const user = await getAuthUser();
    if (user && start !== user.id) {
      const supabase = await createClient();
      const { data: convId } = await supabase.rpc("dm_get_or_create_conversation", {
        _other_user_id: start,
      });
      if (convId) {
        redirect(`/community/messages/${convId}`);
      }
    }
  }

  return (
    <div className="flex h-[60vh] flex-col items-center justify-center text-center">
      <MessageSquare className="mb-3 h-10 w-10 text-muted-foreground" />
      <h2 className="text-lg font-semibold text-foreground">Your messages</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Select a conversation from the sidebar or start a new one
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\(marketing\)/community/messages/page.tsx
git commit -m "feat(dm): handle start-conversation via search param redirect"
```

---

### Task 13: Enable Supabase Realtime Publication

**Important:** The migration in Task 1 already includes `ALTER PUBLICATION supabase_realtime ADD TABLE` for all three DM tables. However, Supabase Realtime also requires that you enable replication for specific columns. Verify this works by checking that real-time events are received.

**Files:**
- No new files — verification step

- [ ] **Step 1: Verify Realtime is enabled**

Run: `npx supabase db reset`

Then start the dev server and test:

Run: `npm run dev`

Open the app, navigate to `/community/messages`, and verify:
1. Conversation list loads in the sidebar
2. Clicking a conversation opens the chat view
3. Sending a message works (appears after action completes)
4. Opening a second browser window and sending a message shows it in real-time in the first window

- [ ] **Step 2: Fix any Realtime issues**

If Realtime events are not coming through, check:
- The Supabase project has Realtime enabled (it is by default for local dev)
- The `ALTER PUBLICATION` statements in the migration applied cleanly
- RLS policies allow the user to read the relevant rows

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix(dm): resolve realtime subscription issues"
```

---

### Task 14: End-to-End Smoke Test

**Files:**
- No new files — verification step

- [ ] **Step 1: Run build to check for TypeScript/import errors**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: No new lint errors.

- [ ] **Step 3: Manual smoke test**

Test the following flows:

1. **Start a new conversation:** Click "+ New message" in sidebar, search for a user, click them, verify redirect to chat view
2. **Send a message:** Type in TipTap, click Send, verify message appears
3. **Rich text:** Send a message with **bold** and *italic* text, verify formatting renders
4. **Edit a message:** Hover over own message, click edit, change text, save
5. **Delete a message:** Hover over own message, click delete, verify "This message was deleted" shows
6. **Unread badges:** Send a message from user B, verify user A sees unread badge in sidebar and navbar
7. **Mark as read:** User A opens the conversation, verify badge clears
8. **Real-time:** Have two browser tabs open (different users), send a message, verify it appears in real-time
9. **Navigation:** Click the navbar envelope icon, verify it goes to `/community/messages`
10. **Existing conversation:** Search for a user you already have a conversation with, verify it navigates to the existing conversation

- [ ] **Step 4: Commit any fixes from smoke testing**

```bash
git add -A
git commit -m "fix(dm): address issues found during smoke testing"
```
