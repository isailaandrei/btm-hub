# Admin AI: start-and-poll ask (fix the ~60s Hostinger transport timeout)

Plan authored by Fable, Jul 30 2026. Implements `docs/plans/opus-task-queue.md`
§8. Implementer: follow exactly; where this plan and the code disagree, STOP
and report. Branch: `feat/admin-ai-interpretation-rules` (already checked out —
this work stacks on the interpretation-rules commits already on it). Do NOT
commit, do NOT push, do NOT run the live eval (`RUN_ADMIN_AI_EVAL`), do NOT
touch `.env*` or `.admin-ai-debug/`. Unit tests via one-shot
`npx vitest run <paths>` only. Do not modify `runGlobalSynthesis` internals or
anything the eval asserts (this change is transport/persistence only).

## Why (context you need)

The ask currently runs as ONE held Server Action POST: `askAdminAiQuestion`
awaits the full `runAdminAiAnalysis` (7–170s). Hostinger's front proxy kills
responses that take longer than ~60s and hands the browser an HTML error page
→ React throws "An unexpected response was received from the server" while
Node finishes the work and persists the answer anyway (live incident Jul 30
2026). Fix: the action returns immediately and the analysis completes AFTER
the response via Next 16's `after()` (from `next/server` — verified: callable
in Server Functions; `revalidatePath` works inside it; on self-hosted Node it
runs in-process to completion). The client polls for completion and then
loads the persisted thread.

Current shapes you will touch (verified Jul 30):

- `src/app/(admin)/admin/admin-ai/actions.ts` — `askAdminAiQuestion` builds
  thread + user message, awaits `runAdminAiAnalysis`, returns
  `AdminAiAskFormState`; `finally` clears the progress reporter; the catch
  reads `error.assistantMessageId` (set by `persistSynthesisFailure`).
  `loadAdminAiThread(threadId)` already returns the serialized full thread.
- `src/lib/admin-ai/orchestrator.ts` — `runCardSynthesis` persists the
  assistant message ONLY at the end: `createAdminAiMessage(... status:
  "complete" ...)` on success, `persistInsufficientResponse`, and
  `persistFailedAssistantMessage` on failure. There is no update path today.
- `src/lib/data/admin-ai.ts` — has `createAdminAiMessage` (insert only).
- `src/app/api/admin-ai/progress/route.ts` — GET, `requireAdmin`, `?id=`
  progress UUID → `{ snapshot }`. The comment explains why polling must be a
  route, not an action (React serializes actions per client) — that
  constraint applies to ALL polling added here.
- `src/app/(admin)/admin/admin-ai/question-form.tsx` — `useActionState`;
  polls the progress route every 2s while `isPending && scope === "global"`;
  `onResolved(state)` fires once per resolved ask (dedup via
  `resolvedSignature`/`handledRef`); rotates `progressId` per resolution via
  a render-time state adjustment (repo rule: no setState-in-useEffect).
- `src/app/(admin)/admin/admin-ai/panel.tsx` — `handleAskResolved` upserts
  the thread and replaces messages; `handleSelectThread` loads via
  `loadAdminAiThread`.
- `src/app/(admin)/admin/admin-ai/message-list.tsx` + `answer-view.tsx` —
  assistant messages render via `AnswerView`; failed status gets destructive
  styling; there is no "running" rendering today.
- `ui-state.test.ts` — source-string smoke tests over these components
  (readFileSync + toContain); keep green, extend.

## Change A — data layer: `updateAdminAiMessage`

`src/lib/data/admin-ai.ts`: add `updateAdminAiMessage(input: { messageId;
content; status; queryPlan?; responseJson?; modelMetadata? })` — UPDATE of the
existing row by id, mirroring `createAdminAiMessage`'s column mapping and
error style (fail loud with context). Follow the file's existing client
choice and error-handling idioms exactly. If the file has a co-located test,
mirror its patterns for the new function.

## Change B — orchestrator: persist into a provided placeholder

`src/lib/admin-ai/orchestrator.ts`:

1. Add ONE internal helper, e.g. `persistAssistantMessage(input: { threadId;
   assistantMessageId?: string; content; status; queryPlan; responseJson?;
   modelMetadata })`: updates the row when `assistantMessageId` is provided
   (Change A), inserts via `createAdminAiMessage` when not, and returns the
   message id. Route ALL FOUR existing persist sites through it:
   - global complete (`createAdminAiMessage` call in `runCardSynthesis`),
   - `persistInsufficientResponse`,
   - `persistFailedAssistantMessage`,
   - the contact-scope complete persist near the end of `runCardSynthesis`
     (find it below the global branch; same shape).
2. Thread an optional `assistantMessageId` through `runAdminAiAnalysis`'s
   input → `runCardSynthesis` → the helper. When absent, behavior must be
   byte-identical to today (the eval harness and any other caller pass
   nothing).
3. `persistSynthesisFailure` keeps attaching `assistantMessageId` to the
   thrown error (now the placeholder id when one was provided).

## Change C — the action: start, schedule `after()`, return

`src/app/(admin)/admin/admin-ai/actions.ts`:

1. Rename `askAdminAiQuestion` → `startAdminAiQuestion` (grep confirms the
   only consumer is `question-form.tsx`; update it and `actions.test.ts`).
   Keep `AdminAiAskFormState` as-is. REMINDER (repo landmine): `"use server"`
   files must export only async functions — declare no new type-only
   re-exports.
2. New flow after validation/availability checks (which stay identical):
   - create thread (if needed) + user message exactly as today;
   - create the PLACEHOLDER assistant message: `createAdminAiMessage({
     threadId, role: "assistant", status: "running", content: "" })`;
   - build the progress reporter exactly as today;
   - schedule the continuation:
     ```ts
     after(async () => {
       try {
         const analysis = await runAdminAiAnalysis({
           scope, threadId, question, contactId,
           assistantMessageId: placeholderId,
           onProgress: progressReporter?.report,
         });
         adminAiDebugLog("ask-continuation-done", { threadId, status: analysis.status });
       } catch (error) {
         // Last-resort failure write so the placeholder can never stay
         // "running" after a caught error. persistSynthesisFailure already
         // updated it for pipeline errors; this covers everything else.
         console.error("[admin-ai] ask continuation failed", error);
         try {
           await updateAdminAiMessage({
             messageId: placeholderId,
             status: "failed",
             content: error instanceof Error ? error.message : "Admin AI analysis failed.",
           });
         } catch (persistError) {
           console.error("[admin-ai] failed to mark placeholder failed", persistError);
         }
       } finally {
         revalidateAdminAiViews(scope, contactId);
         if (progressReporter) void progressReporter.clear();
       }
     });
     ```
   - return the form state IMMEDIATELY: `success: true, message: null`,
     `thread` serialized as today, `messages` = prior thread messages + the
     user message + the placeholder summary (`status: "running"`, empty
     content, `queryPlan/response/citations` null/empty).
3. Delete the old await-path (including its catch/finally); the debug logs
   `ask-action` / `ask-action-result` / `ask-action-failed` move sensibly
   (start log in the action; result/failed logs in the continuation).
4. Keep the NOTE comment about polling-must-be-a-route; it now also covers
   completion polling.

## Change D — progress route: also report the assistant message status

`src/app/api/admin-ai/progress/route.ts`: accept optional `&messageId=<uuid>`
alongside `id`. When present (validate UUID, 400 on garbage), fetch that
message's `id`,`status`,`thread_id` and include `assistantMessage: { id,
status } | null` in the payload; `id` (progress) remains required and its
behavior unchanged. Add a small data-layer reader
`getAdminAiMessageStatus(messageId)` in `src/lib/data/admin-ai.ts` (select
id, status, thread_id only — do NOT load the full thread on every poll).
`requireAdmin` stays first. Update `route.test.ts` (it exists) for: messageId
returns status; invalid messageId → 400; omitted messageId → old payload.

## Change E — client: awaiting phase, completion poll, running bubble

`question-form.tsx`:

1. Track the awaited placeholder: `const [awaiting, setAwaiting] = useState<{
   threadId: string; messageId: string; progressId: string; startedAt: number } | null>(null)`.
   When the start action resolves (the existing `resolvedSignature` effect)
   and the last returned message is a `running` assistant message, call
   `onResolved(state)` (so the panel shows the question + running bubble) and
   enter awaiting via a render-time state adjustment or inside that same
   effect — follow the component's existing patterns (it deliberately avoids
   setState-in-effect for derived state; the awaiting entry is a response to
   an external event arriving through action state, which the existing
   `useEffect` on `resolvedSignature` already models — extend THAT effect).
2. The 2s poll effect now runs while `isPending || awaiting`, and its fetch
   URL includes `&messageId=` when awaiting. On `assistantMessage.status`
   !== "running": stop awaiting, `loadAdminAiThread(threadId)` once (server
   action — fine here, nothing else is pending), hand the result to
   `onResolved` shape-compatibly (build an `AdminAiAskFormState` with
   `success: status === "complete"`), rotate `progressId`. Progress-stage
   display (`describeProgress`) keeps working unchanged during awaiting
   (scope-gated to global exactly as today; completion polling itself must
   run for BOTH scopes).
3. Client-side stall guard: if awaiting exceeds 8 minutes, stop polling and
   show (in the existing feedback area, destructive style): "Still running
   after 8 minutes — the server may have restarted. Reopen the thread from
   Past questions in a bit; if it never completes, re-ask." Do not fabricate
   a failure into the thread — display-only.
4. The submit button/textarea disable while `isPending || awaiting`. The
   "AI is thinking" pill shows during both.
5. Multi-question threads: the form's hidden `threadId` field logic (if any —
   check how follow-up questions reuse `state.thread`) must keep working; the
   placeholder round-trips through the same state shape, so no change is
   expected — verify, don't assume.

`message-list.tsx` / `answer-view.tsx`:

6. Render a `running` assistant message as a thinking bubble: spinner
   (`Loader2` + `animate-spin`, `role="status"`) and the text "Analyzing —
   the answer will appear here." Where to branch: `message-list.tsx` decides
   between `AnswerView` and a running bubble (do not push running handling
   into AnswerView if its contract assumes a response). Styling: reuse the
   assistant card classes (`border-primary/20 bg-white shadow-sm ring-1
   ring-primary/10`).
7. Stale-display guard (read side, no DB write): a `running` assistant
   message whose `createdAt` is older than 10 minutes renders with the failed
   styling and the text "Timed out — the server likely restarted mid-run.
   Re-ask the question." Compute age at render (`Date.now() -
   new Date(createdAt).getTime()`); this is a client component, no SSR
   mismatch risk beyond the usual — if the file computes dates during render
   already (it does: `toLocaleTimeString`), follow suit.

`panel.tsx`: `handleAskResolved` already upserts thread + replaces messages
and is called for both the start state and the final state — verify no change
needed beyond what compiles.

`ui-state.test.ts`: keep the existing assertions green (strings may move
between files — adjust paths, not intent) and add: running-bubble strings
("Analyzing —", spinner) and the stall-guard string exist in the sources.

## Tests (all one-shot vitest)

- `actions.test.ts`: rework for `startAdminAiQuestion`. Mock `next/server`'s
  `after` per-file: `vi.mock("next/server", () => ({ after: vi.fn((cb) =>
  { capturedAfter = cb; }) }))` (check what else actions.ts imports from
  next/server — today: nothing; `revalidatePath` comes from next/cache).
  Cases: (1) action resolves promptly with a running placeholder while a
  never-resolving `runAdminAiAnalysis` mock is pending — placeholder created
  with status "running", `after` scheduled, state carries user + placeholder;
  (2) invoking the captured continuation with a resolving analysis mock calls
  `runAdminAiAnalysis` with `assistantMessageId` = placeholder id, then
  clears progress and revalidates (contact scope) — assert order-insensitive;
  (3) continuation catch: analysis mock rejects (error WITHOUT
  assistantMessageId) → `updateAdminAiMessage` called with status "failed";
  (4) validation failure still returns errors without creating anything.
- `orchestrator.test.ts`: with `assistantMessageId` provided —
  global-complete updates (not inserts); failure path updates and the thrown
  error carries the SAME id; without the param, existing tests prove insert
  behavior unchanged (they already exist — do not weaken them).
- data-layer test for `updateAdminAiMessage` + `getAdminAiMessageStatus`
  following the file's existing test conventions (if
  `src/lib/data/admin-ai.test.ts` exists; if not, cover through
  actions/orchestrator mocks and say so in the report).
- `route.test.ts` for Change D.

## Gates

`npx tsc --noEmit` · `npx eslint <touched files>` · targeted vitest for every
touched test file · full `npm run test:unit` once at the end. The live eval is
NOT needed (no synthesis-semantics change) and must not be run.

## Report

Files touched + one-liners; gate commands + tails; deviations/judgment calls;
anything incomplete. Note explicitly: any place the client state flow forced a
pattern the repo forbids (setState-in-effect) and how you resolved it.
