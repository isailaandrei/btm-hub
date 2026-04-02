# Direct Messaging Feature — Design Spec

## Overview

One-to-one private messaging between community members, integrated into the community section. Messages support rich text (bold, italic, links) and are delivered in real-time via Supabase Realtime.

## Data Model

### Three new tables

**`dm_conversations`** — one row per unique pair of users

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid (PK) | Generated |
| `user1_id` | uuid (FK → profiles) | Constraint: user1_id < user2_id (prevents duplicate pairs) |
| `user2_id` | uuid (FK → profiles) | |
| `last_message_at` | timestamptz | Updated on each new message, used for sidebar sorting |
| `created_at` | timestamptz | |

Unique constraint on `(user1_id, user2_id)`.

**`dm_messages`** — individual messages within a conversation

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid (PK) | Generated |
| `conversation_id` | uuid (FK → dm_conversations) | |
| `sender_id` | uuid (FK → profiles) | |
| `body` | text | HTML content from TipTap |
| `body_format` | text | "text" or "html", default "html" |
| `edited_at` | timestamptz (nullable) | Non-null = message was edited |
| `deleted_at` | timestamptz (nullable) | Soft delete — UI shows "This message was deleted" |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

**`dm_read_receipts`** — tracks when each user last read a conversation

| Column | Type | Notes |
|--------|------|-------|
| `conversation_id` | uuid (FK → dm_conversations) | Composite PK |
| `user_id` | uuid (FK → profiles) | Composite PK |
| `last_read_at` | timestamptz | Upserted when user opens a conversation |

**Unread count query:** Messages in conversation where `created_at > last_read_at` and `sender_id != current_user`.

**RLS policies:** Users can only read/write conversations and messages they participate in.

## Routes & Navigation

### Routes (under community)

- `/community/messages` — messages view, no conversation selected (placeholder: "Select a conversation")
- `/community/messages/[conversationId]` — specific conversation open

### Sidebar integration

- Existing `ChannelSidebar` gets a "Messages" section below topics separator
- Shows conversation list: avatar initials, display name, unread badge (red circle with count)
- Conversations sorted by `last_message_at` descending
- "+ New message" button opens inline search input
- Inline search reuses existing `/api/community/mention-search` endpoint
- Search results exclude current user

### Navbar

- Envelope icon next to auth buttons (visible when logged in)
- Red unread badge when total unread count > 0
- Links to `/community/messages`

### Profile page (Phase 2)

- "Send message" button on other users' profiles
- Creates or navigates to existing conversation

## Real-time Architecture

### Supabase Realtime channels (browser ↔ Supabase, no server involved)

**`dm:conversations:{userId}`** — always subscribed when logged in
- Listens for INSERT/UPDATE on `dm_conversations` where user is participant
- Updates sidebar order when `last_message_at` changes
- Updates unread badges when new messages arrive or read receipts change

**`dm:messages:{conversationId}`** — subscribed when a conversation is open
- Delivers new messages (INSERT)
- Delivers edits (UPDATE with changed body, edited_at)
- Delivers deletions (UPDATE with deleted_at set)

### Unread count system

- Initial load: server fetches unread counts per conversation
- Live updates: Realtime increments on incoming message, clears on marking read
- Navbar badge: client component showing sum of all unread counts, updates live

### Read receipts

- Opening a conversation upserts `dm_read_receipts.last_read_at = now()`
- Other user's Realtime subscription picks up the change
- Phase 1: badge clears when conversation is read
- Phase 2: checkmark indicators on individual messages

## Components & File Structure

### New files

```
src/
├── app/(marketing)/community/
│   ├── messages/
│   │   ├── page.tsx                    # Empty state: "Select a conversation"
│   │   ├── [conversationId]/
│   │   │   └── page.tsx                # Chat view (server component, initial fetch)
│   │   └── actions.ts                  # sendMessage, editMessage, deleteMessage, markAsRead, startConversation
│
├── components/community/
│   ├── MessagesSidebar.tsx             # Conversation list + inline search
│   ├── MessageThread.tsx               # Chat message list with real-time
│   ├── MessageBubble.tsx               # Single message (avatar, body, timestamp, edited, actions)
│   ├── MessageComposer.tsx             # TipTap: bold, italic, link (Phase 2: image, mentions)
│   └── MessageRealtimeProvider.tsx     # Client component wrapping real-time subscriptions
│
├── components/layout/
│   └── UnreadBadge.tsx                 # Client component, subscribes to unread count
│
├── lib/data/
│   └── messages.ts                     # getConversations, getMessages, getUnreadCounts
│
├── lib/validations/
│   └── messages.ts                     # Zod schemas
│
└── types/
    └── database.ts                     # Add DmConversation, DmMessage, DmReadReceipt
```

### Modified files

- `src/components/community/ChannelSidebar.tsx` — add MessagesSidebar below topics
- `src/components/layout/Navbar.tsx` — add envelope icon with UnreadBadge
- `src/app/(marketing)/community/layout.tsx` — pass messages data for sidebar

### Reused from existing code

- `RichTextEditor.tsx` as base for `MessageComposer.tsx` (stripped-down config)
- `mention-suggestion.ts` / `MentionList.tsx` for @mentions (Phase 2)
- Realtime pattern from `admin-data-provider.tsx`
- `ForumActionState` pattern for server action return types

## Key Interactions

### Sending a message

1. User types in TipTap composer, hits Send
2. Server action validates with Zod, inserts into `dm_messages`, updates `last_message_at`
3. Phase 1: standard server action flow (button shows pending state, message appears after action completes). Phase 2: optimistic UI (message appears instantly before server confirms)
4. Recipient receives via Realtime

### Editing a message

- Own messages only, via hover menu
- Sets `edited_at`, shows "edited" label on bubble
- Realtime delivers UPDATE to other user

### Deleting a message

- Soft delete — sets `deleted_at`
- UI shows "This message was deleted" placeholder
- Row preserved in DB for conversation continuity

### Starting a new conversation

- Sidebar: click "+ New message", inline search appears, pick a user
- Profile page: "Send message" button (Phase 2)
- Both check for existing conversation to prevent duplicates

### Edge cases

- **Self-messaging:** Prevented — search excludes current user
- **Deleted accounts:** Show "Deleted user" with generic avatar
- **Empty conversation:** Show composer with prompt text
- **Pagination:** 50 most recent messages, scroll up for older (cursor-based, Phase 2)

## Rich Text (TipTap)

### Phase 1 extensions

- StarterKit (bold, italic only — no headings, lists, blockquotes, horizontal rules)
- Link

### Phase 2 additions

- Image upload (via Supabase Storage, reusing community-images pattern)
- Mentions (@user)

## Phased Implementation

### Phase 1 — Core messaging

- Database tables + RLS policies + migration
- Conversation list in sidebar with unread badges
- Chat view with message sending (TipTap composer)
- Real-time message delivery
- Mark as read + unread counts
- Start new conversation (sidebar inline search)
- Edit and delete messages
- Navbar envelope icon with unread badge

### Phase 2 — Polish & extras

- Read receipt indicators on messages (checkmarks)
- "Send message" button on profile pages
- Image upload in messages
- @mentions in messages
- Scroll-to-load older messages (pagination)
- Optimistic UI for sending

## Future Considerations

- AI agent integration: conversations will be accessible for building user profiles based on DM content, application data, and meeting transcripts. Schema designed to support this (messages stored as structured HTML, not ephemeral).
- Group messaging: not in scope, but `dm_conversations` could be extended with a participants join table if needed later.
- Blocking/reporting: deferred — community is curated, admin handles moderation manually.
