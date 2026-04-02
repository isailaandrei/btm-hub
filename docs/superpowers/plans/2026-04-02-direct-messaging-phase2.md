# Direct Messaging Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add read receipts, image upload, @mentions, pagination, optimistic UI, and community DM entry points to the existing Phase 1 messaging system.

**Architecture:** All 6 features are enhancements to existing components — no new files needed. The MessageComposer gets image upload + mentions (reusing existing TipTap extensions), MessageThread gets pagination + optimistic messages + "Seen" label, and PostCard/ThreadHeader get a small DM icon button.

**Tech Stack:** Next.js 16 (App Router), React 19, Supabase (Realtime), TipTap (@tiptap/extension-image, @tiptap/extension-mention), Tailwind CSS 4

---

## File Structure

All modifications to existing files:

| File | Changes |
|------|---------|
| `src/components/community/MessageComposer.tsx` | Add Image + Mention TipTap extensions, image upload handler, onSend callback for optimistic UI |
| `src/components/community/MessageThread.tsx` | Add pagination (scroll-to-load), optimistic message state, "Seen" label, read receipt Realtime subscription |
| `src/components/community/MessageBubble.tsx` | Add `showSeen` prop, optimistic styling (`_optimistic` field), retry button |
| `src/lib/data/messages.ts` | Add cursor-based pagination to `getMessages`, add `getRecipientLastReadAt` fetcher |
| `src/app/(marketing)/community/messages/[conversationId]/page.tsx` | Fetch and pass `recipientLastReadAt` to MessageThread |
| `src/components/community/PostCard.tsx` | Add DM icon button next to author name |
| `src/components/community/ThreadHeader.tsx` | Add DM icon button next to author name |
| `src/types/database.ts` | Add `OptimisticDmMessage` type |

---

### Task 1: Image Upload + @Mentions in Composer

**Files:**
- Modify: `src/components/community/MessageComposer.tsx`

- [ ] **Step 1: Add Image and Mention TipTap extensions**

In `src/components/community/MessageComposer.tsx`, add the imports at the top:

```typescript
import Image from "@tiptap/extension-image";
import Mention from "@tiptap/extension-mention";
import { ImageIcon, Loader2 } from "lucide-react";
import { mentionSuggestion } from "./mention-suggestion";
import { uploadCommunityImage } from "@/app/(marketing)/community/actions";
```

Update the `useState` imports to include `useRef` for the file input (already imported). Add state for image upload:

```typescript
const fileInputRef = useRef<HTMLInputElement>(null);
const [isUploading, setIsUploading] = useState(false);
const [uploadError, setUploadError] = useState<string | null>(null);
```

Add the extensions to the `useEditor` config, inside the `extensions` array after `Placeholder`:

```typescript
      Image.configure({
        inline: false,
        allowBase64: false,
      }),
      Mention.configure({
        HTMLAttributes: {
          class: "text-primary font-medium",
          "data-type": "mention",
        },
        renderLabel({ node }) {
          return `@${node.attrs.label ?? node.attrs.id}`;
        },
        suggestion: mentionSuggestion,
      }),
```

- [ ] **Step 2: Add image upload handler**

Add the `handleImageUpload` function after the `addLink` function:

```typescript
  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !editor) return;
    e.target.value = "";
    setUploadError(null);
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      const result = await uploadCommunityImage(formData);
      if (result.error) {
        setUploadError(result.error);
        return;
      }
      if (result.url) {
        editor.chain().focus().setImage({ src: result.url }).createParagraphNear().run();
      }
    } catch {
      setUploadError("Upload failed. Please try again.");
    } finally {
      setIsUploading(false);
    }
  }
```

- [ ] **Step 3: Add image button to toolbar and file input to form**

Add the image button after the link button in the toolbar (before the `<div className="ml-auto">` line):

```tsx
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={btn(false)}
              title="Add image"
              disabled={isUploading}
            >
              {isUploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ImageIcon className="h-3.5 w-3.5" />
              )}
            </button>
```

Add the hidden file input and upload error display after the `<EditorContent>` and before the closing `</div>` of the rounded-lg container:

```tsx
        {uploadError && (
          <p className="px-3 py-1 text-xs text-destructive">{uploadError}</p>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handleImageUpload}
          className="hidden"
        />
```

- [ ] **Step 4: Commit**

```bash
git add src/components/community/MessageComposer.tsx
git commit -m "feat(dm): add image upload and @mentions to message composer"
```

---

### Task 2: Optimistic UI for Sending

**Files:**
- Modify: `src/types/database.ts`
- Modify: `src/components/community/MessageComposer.tsx`
- Modify: `src/components/community/MessageThread.tsx`
- Modify: `src/components/community/MessageBubble.tsx`

- [ ] **Step 1: Add OptimisticDmMessage type**

Append to `src/types/database.ts` after the `DmReadReceipt` interface:

```typescript
export interface OptimisticDmMessage extends DmMessageWithSender {
  _optimistic?: "sending" | "failed";
}
```

- [ ] **Step 2: Update MessageComposer to use onSend callback**

In `src/components/community/MessageComposer.tsx`, update the interface to accept an `onSend` callback:

```typescript
interface MessageComposerProps {
  conversationId: string;
  onSend?: (body: string) => void;
}
```

Update the component signature to destructure `onSend`:

```typescript
export function MessageComposer({ conversationId, onSend }: MessageComposerProps) {
```

Replace the `useActionState` form submission approach. Remove the `useActionState` import and usage. Instead, handle submission manually:

Remove:
```typescript
const [state, formAction, isPending] = useActionState(sendMessage, initialState);
```

Replace with:
```typescript
const [isPending, setIsPending] = useState(false);
const [error, setError] = useState<string | null>(null);
```

Remove the `prevResetKey` state and the clear-on-success block. Replace with a `handleSubmit` function:

```typescript
  async function handleSubmit() {
    if (!editor || editor.isEmpty) return;
    const html = editor.getHTML();
    const textContent = html.replace(/<[^>]*>/g, "").trim();
    if (!textContent) return;

    // Optimistic: notify parent immediately
    onSend?.(html);
    editor.commands.clearContent();
    if (hiddenRef.current) hiddenRef.current.value = "";
    setError(null);
    setIsPending(true);

    try {
      const formData = new FormData();
      formData.append("conversationId", conversationId);
      formData.append("body", html);
      formData.append("bodyFormat", "html");
      const result = await sendMessage({ errors: null, message: "", success: false, resetKey: 0 }, formData);
      if (!result.success) {
        setError(result.message || result.errors?.body || "Failed to send");
      }
    } catch {
      setError("Failed to send message");
    } finally {
      setIsPending(false);
    }
  }
```

Change the `<form action={formAction}>` to `<div>` (no longer a form action):

```tsx
    <div className="border-t border-border bg-card px-4 py-3">
```

Remove the hidden inputs for `conversationId`, `body`, and `bodyFormat`.

Change the submit button from `type="submit"` to `type="button" onClick={handleSubmit}`:

```tsx
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isPending}
                className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                title="Send message"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
```

Update the error display at the bottom:

```tsx
      {error && (
        <p className="mt-1 text-xs text-destructive">{error}</p>
      )}
```

Close with `</div>` instead of `</form>`.

- [ ] **Step 3: Update MessageThread to handle optimistic messages**

In `src/components/community/MessageThread.tsx`, update imports:

```typescript
import type { DmMessageWithSender, OptimisticDmMessage, Profile } from "@/types/database";
```

Change the state type:

```typescript
const [messages, setMessages] = useState<OptimisticDmMessage[]>(initialMessages);
```

Add an `addOptimisticMessage` function and pass it to the composer:

```typescript
  function addOptimisticMessage(body: string) {
    const optimistic: OptimisticDmMessage = {
      id: `optimistic-${Date.now()}`,
      conversation_id: conversationId,
      sender_id: currentUserId,
      body,
      body_format: "html",
      edited_at: null,
      deleted_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      sender: null,
      _optimistic: "sending",
    };
    setMessages((prev) => [...prev, optimistic]);
  }
```

In the Realtime INSERT handler, when we receive the real message, also remove any optimistic messages that are "sending" (since they've been replaced by the real one). Update the `setMessages` call inside the INSERT handler:

```typescript
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            // Remove optimistic messages from same sender (they've been confirmed)
            const withoutOptimistic = newMsg.sender_id === currentUserId
              ? prev.filter((m) => !m._optimistic)
              : prev;
            return [...withoutOptimistic, newMsg];
          });
```

Export the `addOptimisticMessage` via a ref or render the composer inside the thread. The simplest approach: render `MessageComposer` inside `MessageThread` and pass `onSend={addOptimisticMessage}`. Update the component to accept and render the composer:

Actually, to keep the components separate and avoid a large refactor, the cleanest approach is to lift the optimistic state up. Update `MessageThread` to accept an `onSend` render prop pattern. But even simpler: **move the composer inside the thread component's return**.

Update `MessageThreadProps`:

```typescript
interface MessageThreadProps {
  conversationId: string;
  currentUserId: string;
  initialMessages: DmMessageWithSender[];
}
```

No prop change needed — instead, render the composer inside the thread. Update the return JSX to include the composer:

```tsx
  return (
    <>
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
      <MessageComposer conversationId={conversationId} onSend={addOptimisticMessage} />
    </>
  );
```

Add the import:

```typescript
import { MessageComposer } from "./MessageComposer";
```

- [ ] **Step 4: Remove MessageComposer from conversation page**

In `src/app/(marketing)/community/messages/[conversationId]/page.tsx`, remove the `MessageComposer` import and its JSX. The thread now renders its own composer.

Remove:
```typescript
import { MessageComposer } from "@/components/community/MessageComposer";
```

Remove from JSX:
```tsx
      {/* Composer */}
      <MessageComposer conversationId={conversationId} />
```

- [ ] **Step 5: Add optimistic styling to MessageBubble**

In `src/components/community/MessageBubble.tsx`, update the import:

```typescript
import type { OptimisticDmMessage } from "@/types/database";
```

Update the interface:

```typescript
interface MessageBubbleProps {
  message: OptimisticDmMessage;
  isOwn: boolean;
  showSeen?: boolean;
}
```

In the component, add the optimistic check:

```typescript
  const isOptimistic = !!message._optimistic;
  const isFailed = message._optimistic === "failed";
```

Wrap the outer container with conditional opacity for sending state:

```typescript
      className={cn("group flex gap-2 px-4 py-1", isOwn && "flex-row-reverse", isOptimistic && "opacity-60")}
```

- [ ] **Step 6: Commit**

```bash
git add src/types/database.ts src/components/community/MessageComposer.tsx src/components/community/MessageThread.tsx src/components/community/MessageBubble.tsx src/app/\(marketing\)/community/messages/\[conversationId\]/page.tsx
git commit -m "feat(dm): add optimistic UI for message sending"
```

---

### Task 3: "Seen" Read Receipt

**Files:**
- Modify: `src/lib/data/messages.ts`
- Modify: `src/app/(marketing)/community/messages/[conversationId]/page.tsx`
- Modify: `src/components/community/MessageThread.tsx`
- Modify: `src/components/community/MessageBubble.tsx`

- [ ] **Step 1: Add `getRecipientLastReadAt` fetcher**

In `src/lib/data/messages.ts`, add this function after `getConversation`:

```typescript
export const getRecipientLastReadAt = cache(async function getRecipientLastReadAt(
  conversationId: string,
): Promise<string | null> {
  const user = await getAuthUser();
  if (!user) return null;

  const supabase = await createClient();

  // Get the conversation to find the other user
  const { data: conv } = await supabase
    .from("dm_conversations")
    .select("user1_id, user2_id")
    .eq("id", conversationId)
    .single();

  if (!conv) return null;

  const otherId = conv.user1_id === user.id ? conv.user2_id : conv.user1_id;

  const { data: receipt } = await supabase
    .from("dm_read_receipts")
    .select("last_read_at")
    .eq("conversation_id", conversationId)
    .eq("user_id", otherId)
    .single();

  return receipt?.last_read_at ?? null;
});
```

- [ ] **Step 2: Pass recipientLastReadAt to MessageThread**

In `src/app/(marketing)/community/messages/[conversationId]/page.tsx`, import and fetch the read receipt:

Add import:
```typescript
import { getConversation, getMessages, getRecipientLastReadAt } from "@/lib/data/messages";
```

Update the `Promise.all`:

```typescript
  const [user, conversation, messages, recipientLastReadAt] = await Promise.all([
    getAuthUser(),
    getConversation(conversationId),
    getMessages(conversationId),
    getRecipientLastReadAt(conversationId),
  ]);
```

Pass it to `MessageThread`:

```tsx
      <MessageThread
        conversationId={conversationId}
        currentUserId={user.id}
        initialMessages={messages}
        recipientLastReadAt={recipientLastReadAt}
      />
```

- [ ] **Step 3: Track recipientLastReadAt in MessageThread**

In `src/components/community/MessageThread.tsx`, update the props:

```typescript
interface MessageThreadProps {
  conversationId: string;
  currentUserId: string;
  initialMessages: DmMessageWithSender[];
  recipientLastReadAt: string | null;
}
```

Add state for the read-at timestamp:

```typescript
const [lastReadAt, setLastReadAt] = useState<string | null>(recipientLastReadAt);
```

Add a Realtime subscription for the other user's read receipts. Inside the existing `useEffect` that subscribes to messages, add another channel listener for read receipts:

```typescript
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "dm_read_receipts",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            const receipt = payload.new as { user_id: string; last_read_at: string };
            // Only update if it's the OTHER user's read receipt
            if (receipt.user_id !== currentUserId) {
              setLastReadAt(receipt.last_read_at);
            }
          }
        },
      )
```

Compute which message gets the "Seen" label. In the render, find the last own message that is read:

```typescript
  // Find the last own message that the recipient has read
  const lastSeenMessageId = (() => {
    if (!lastReadAt) return null;
    const ownMessages = messages
      .filter((m) => m.sender_id === currentUserId && !m._optimistic && !m.deleted_at)
      .filter((m) => new Date(m.created_at) <= new Date(lastReadAt));
    return ownMessages.length > 0 ? ownMessages[ownMessages.length - 1].id : null;
  })();
```

Pass `showSeen` to `MessageBubble`:

```tsx
            <MessageBubble
              key={msg.id}
              message={msg}
              isOwn={msg.sender_id === currentUserId}
              showSeen={msg.id === lastSeenMessageId}
            />
```

- [ ] **Step 4: Render "Seen" label in MessageBubble**

In `src/components/community/MessageBubble.tsx`, destructure `showSeen`:

```typescript
export function MessageBubble({ message, isOwn, showSeen = false }: MessageBubbleProps) {
```

After the bubble `</div>` (line 135, after the closing div of the message content) and before the closing `</div>` of the `max-w-[70%]` container, add:

```tsx
        {showSeen && (
          <p className="mt-0.5 text-right text-[11px] text-muted-foreground">Seen</p>
        )}
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/messages.ts src/app/\(marketing\)/community/messages/\[conversationId\]/page.tsx src/components/community/MessageThread.tsx src/components/community/MessageBubble.tsx
git commit -m "feat(dm): add 'Seen' read receipt indicator"
```

---

### Task 4: Scroll-to-Load Older Messages (Pagination)

**Files:**
- Modify: `src/components/community/MessageThread.tsx`

- [ ] **Step 1: Add pagination state and fetch function**

In `src/components/community/MessageThread.tsx`, add the `Loader2` import:

```typescript
import { Loader2 } from "lucide-react";
```

Add pagination state after the existing state declarations:

```typescript
  const [hasMore, setHasMore] = useState(initialMessages.length >= 50);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
```

Add the `loadOlderMessages` function:

```typescript
  async function loadOlderMessages() {
    if (isLoadingMore || !hasMore || messages.length === 0) return;

    const oldest = messages.find((m) => !m._optimistic);
    if (!oldest) return;

    setIsLoadingMore(true);
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("dm_messages")
        .select("*, profiles!dm_messages_sender_fkey(id, display_name, avatar_url)")
        .eq("conversation_id", conversationId)
        .or(`created_at.lt.${oldest.created_at},and(created_at.eq.${oldest.created_at},id.lt.${oldest.id})`)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(50);

      if (error) throw error;

      const olderMessages: OptimisticDmMessage[] = (data ?? []).reverse().map((row) => ({
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

      if (olderMessages.length < 50) setHasMore(false);

      if (olderMessages.length > 0) {
        // Preserve scroll position
        const scrollEl = scrollRef.current;
        const prevScrollHeight = scrollEl?.scrollHeight ?? 0;

        setMessages((prev) => [...olderMessages, ...prev]);

        // Restore scroll position after React renders
        requestAnimationFrame(() => {
          if (scrollEl) {
            scrollEl.scrollTop = scrollEl.scrollHeight - prevScrollHeight;
          }
        });
      }
    } catch {
      // Silently fail — user can try scrolling up again
    } finally {
      setIsLoadingMore(false);
    }
  }
```

- [ ] **Step 2: Add scroll listener**

Add a `useEffect` for the scroll listener after the existing effects:

```typescript
  // Load older messages when scrolled to top
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    function handleScroll() {
      if (el!.scrollTop < 100 && hasMore && !isLoadingMore) {
        loadOlderMessages();
      }
    }

    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
  }, [hasMore, isLoadingMore, messages]);
```

- [ ] **Step 3: Add loading spinner at top**

In the render, add a spinner at the top of the message list. Inside the `flex flex-col gap-1` div, before the messages map:

```tsx
          <div className="flex flex-col gap-1">
            {isLoadingMore && (
              <div className="flex justify-center py-2">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
            {messages.map((msg) => (
```

- [ ] **Step 4: Fix scroll-to-bottom to only scroll on new messages (not pagination)**

Update the existing scroll-to-bottom effect to only trigger for messages added at the end (not prepended):

```typescript
  // Scroll to bottom only when new messages are added at the end
  const prevMessageCountRef = useRef(initialMessages.length);
  useEffect(() => {
    if (messages.length > prevMessageCountRef.current) {
      const lastMsg = messages[messages.length - 1];
      // Only auto-scroll if the newest message is actually new (not from pagination)
      if (lastMsg && !isLoadingMore) {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
      }
    }
    prevMessageCountRef.current = messages.length;
  }, [messages.length, isLoadingMore]);
```

Remove the old scroll effect that just scrolled on `messages.length`.

- [ ] **Step 5: Commit**

```bash
git add src/components/community/MessageThread.tsx
git commit -m "feat(dm): add scroll-to-load older messages with cursor pagination"
```

---

### Task 5: "Send Message" Button in Community

**Files:**
- Modify: `src/components/community/PostCard.tsx`
- Modify: `src/components/community/ThreadHeader.tsx`

- [ ] **Step 1: Add DM button to PostCard**

In `src/components/community/PostCard.tsx`, add imports:

```typescript
import Link from "next/link";
import { MessageSquare } from "lucide-react";
```

In the author info area (line 73, inside the `<div className="flex items-center gap-2 text-sm">` block), after the `(edited)` badge and before the `{post.is_op && <Badge>}` line, add the DM button:

```tsx
          {currentUserId && post.author_id && post.author_id !== currentUserId && (
            <Link
              href={`/community/messages?start=${post.author_id}`}
              className="rounded p-0.5 text-muted-foreground transition-colors hover:text-primary"
              title={`Message ${authorName}`}
            >
              <MessageSquare className="h-3.5 w-3.5" />
            </Link>
          )}
```

- [ ] **Step 2: Add DM button to ThreadHeader**

In `src/components/community/ThreadHeader.tsx`, add imports:

```typescript
import { MessageSquare } from "lucide-react";
```

Update the interface to accept `currentUserId`:

```typescript
interface ThreadHeaderProps {
  thread: ForumThreadWithAuthor;
  topicName?: string | null;
  currentUserId?: string | null;
  isAdmin?: boolean;
  onTogglePin?: (threadId: string) => Promise<void>;
  onToggleLock?: (threadId: string) => Promise<void>;
  onDelete?: (threadId: string) => Promise<void>;
}
```

Update the destructuring:

```typescript
export function ThreadHeader({
  thread,
  topicName,
  currentUserId,
  isAdmin = false,
  onTogglePin,
  onToggleLock,
  onDelete,
}: ThreadHeaderProps) {
```

In the author info area (line 77, inside the `<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">`), after the author name `<span>`, add the DM button:

```tsx
        {currentUserId && thread.author_id && thread.author_id !== currentUserId && (
          <Link
            href={`/community/messages?start=${thread.author_id}`}
            className="rounded p-0.5 text-muted-foreground transition-colors hover:text-primary"
            title={`Message ${authorName}`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
          </Link>
        )}
```

Add the Link import at the top:

```typescript
import Link from "next/link";
```

- [ ] **Step 3: Pass currentUserId to ThreadHeader via ThreadActions**

`ThreadHeader` is rendered inside `src/components/community/ThreadActions.tsx`, which already has `currentUserId`. Pass it through to `ThreadHeader`:

In `ThreadActions.tsx`, add `currentUserId` to the `<ThreadHeader>` JSX:

```tsx
      <ThreadHeader
        thread={thread}
        topicName={topicName}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
        onTogglePin={isAdmin ? toggleThreadPin : undefined}
        onToggleLock={isAdmin ? toggleThreadLock : undefined}
        onDelete={
          isAdmin || (currentUserId && thread.author_id === currentUserId)
            ? deleteThread
            : undefined
        }
      />
```

- [ ] **Step 4: Commit**

```bash
git add src/components/community/PostCard.tsx src/components/community/ThreadHeader.tsx src/components/community/ThreadActions.tsx
git commit -m "feat(dm): add 'Message' button to community posts and thread headers"
```

---

### Task 6: Build Verification

- [ ] **Step 1: Run lint**

Run: `npm run lint`
Expected: No new errors (only pre-existing warnings).

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds with no errors. The `/community/messages` and `/community/messages/[conversationId]` routes are present.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix(dm): resolve lint/build issues from Phase 2"
```
