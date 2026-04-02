# Direct Messaging Phase 2 — Design Spec

## Overview

Six enhancements to the existing Phase 1 DM system: read receipts, message entry points from community, image upload, @mentions, pagination, and optimistic UI.

## 1. "Seen" Read Receipt

**What:** A small "Seen" label below the sender's last message that the recipient has read.

**Logic:**
- Each conversation has two participants. When user A opens user B's conversation, A's `dm_read_receipts.last_read_at` is updated (already implemented in Phase 1)
- The `MessageThread` component needs the **other** participant's `last_read_at` value
- Find the last own message where `created_at <= otherUser_last_read_at` — show "Seen" below it
- Only one "Seen" label per conversation (the latest read message)

**Data changes:**
- `getMessages()` returns an additional `recipientLastReadAt: string | null` field
- Fetch the other participant's read receipt in the conversation page server component and pass to `MessageThread`
- `MessageThread` subscribes to `dm_read_receipts` changes for the conversation to update the "Seen" label in real-time

**UI:** Small `text-[11px] text-muted-foreground` label reading "Seen" below the last-read own message, right-aligned to match the message alignment.

## 2. "Send Message" Button in Community

**What:** A small envelope icon next to author names in community posts, allowing users to DM that person directly.

**Where:** There are no public profile pages, so the button lives in the community thread/post author area — on `PostCard.tsx` and `ThreadHeader.tsx` components, next to the author's display name.

**Behavior:**
- Clicking navigates to `/community/messages?start={authorId}`
- Reuses existing `?start=` redirect logic (find-or-create conversation)
- Hidden for the current user's own posts
- Only shown to authenticated users

**Implementation:** A small `MessageSquare` icon button after the author name, styled as a ghost button.

## 3. Image Upload in Messages

**What:** Add image upload to the message composer, reusing the existing community image upload pattern.

**Reuse:**
- `uploadCommunityImage` server action (already handles auth, validation, Supabase Storage)
- Same allowed types (JPEG, PNG, WebP, GIF), same 5MB limit
- Same Supabase Storage bucket (`community-images`)

**Changes to `MessageComposer`:**
- Add `Image` TipTap extension (same config as `RichTextEditor`: `inline: false, allowBase64: false`)
- Add image toolbar button with file input
- Show upload spinner while uploading
- Insert image URL into editor on success
- Add `image` to `editorState` tracking (not a toggle, just for the toolbar)

## 4. @Mentions in Messages

**What:** Allow `@username` mentions in DM messages, same as community threads.

**Reuse:**
- `Mention` TipTap extension with same config as `RichTextEditor`
- `mentionSuggestion` from `mention-suggestion.ts` (handles debounced search via `/api/community/mention-search`)
- `MentionList` component for the dropdown
- Mention styling already handled by `prose-community` and `prose-dm-own` CSS classes (`span[data-type="mention"]`)

**Changes to `MessageComposer`:**
- Import and add `Mention` extension
- Import `mentionSuggestion` for the suggestion config

## 5. Scroll-to-Load Older Messages (Pagination)

**What:** Load messages in batches of 50. When user scrolls to the top, fetch the next batch of older messages.

**Data changes:**
- `getMessages()` accepts an optional `cursor` parameter: `{ before_created_at: string, before_id: string }`
- Returns `{ messages: DmMessageWithSender[], hasMore: boolean }`
- Query uses `(created_at, id) < (cursor.before_created_at, cursor.before_id)` for cursor-based pagination
- Initial load: 50 most recent (no cursor)

**UI changes in `MessageThread`:**
- Track `hasMore` state and oldest message cursor
- When scrolled to top and `hasMore` is true, fetch older messages via browser Supabase client
- Prepend older messages to the list
- Preserve scroll position after prepending (save `scrollHeight` before, restore after)
- Show a small `Loader2` spinner at the top while loading

**API:** Use browser Supabase client directly (not a server action) since this is a read-only paginated fetch from a client component.

## 6. Optimistic UI for Sending

**What:** Message appears instantly in the thread when the user clicks Send, before the server action completes.

**Approach:**
- Replace `useActionState` form submission with a direct client-side flow:
  1. User clicks Send → extract HTML from TipTap
  2. Immediately append a "pending" message to the thread (temp ID, sender = current user, `status: "sending"`)
  3. Call `sendMessage` server action
  4. On success: replace pending message with real message (or let Realtime deduplication handle it)
  5. On error: mark the pending message as "failed" with a retry button

**Changes:**
- `MessageComposer` gets an `onSend` callback prop instead of using form action directly
- `MessageThread` manages the optimistic message state
- `MessageBubble` renders a faded style for `status: "sending"` and error style for `status: "failed"`
- The existing Realtime INSERT deduplication (`prev.some(m => m.id === newMsg.id)`) prevents doubles — pending messages use a temp ID like `optimistic-{timestamp}` which won't match the real ID

**Type extension:**
```typescript
interface OptimisticMessage extends DmMessageWithSender {
  _optimistic?: "sending" | "failed";
}
```

## Files Changed

### Modified
- `src/components/community/MessageThread.tsx` — pagination, "Seen" label, optimistic messages
- `src/components/community/MessageComposer.tsx` — image upload, @mentions, onSend callback
- `src/components/community/MessageBubble.tsx` — "Seen" label, optimistic styling, retry
- `src/lib/data/messages.ts` — paginated getMessages, recipient read receipt
- `src/app/(marketing)/community/messages/[conversationId]/page.tsx` — pass recipientLastReadAt
- `src/components/community/PostCard.tsx` — "Message" icon button
- `src/components/community/ThreadHeader.tsx` — "Message" icon button

### No new files needed
All changes are enhancements to existing components.
