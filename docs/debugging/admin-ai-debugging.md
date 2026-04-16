# Admin AI Debugging Guide

This guide is for two related problems:

1. debugging React / Next.js behavior in the browser
2. debugging the admin AI pipeline step by step so you can inspect the input and output of each stage

It is written for the current BTM Hub stack:
- Next.js 16 App Router
- React 19
- server actions
- Supabase
- OpenAI-backed admin AI

## The Short Answer

If you want the best debugging setup for this feature, use these together:

1. `React Developer Tools`
   - best for inspecting component props, state, hooks, and render tree
2. browser `Sources` debugger
   - best for breakpoints, stepping through execution, and inspecting variable values
3. browser `Network` tab
   - best for seeing the request timing around form submits and route interactions
4. terminal logs from `npm run dev`
   - best for server actions, retrieval, provider calls, and DB-facing logic
5. direct DB inspection
   - best for checking persisted threads, messages, citations, chunks, dossiers, and ranking cards

## React-Specific Debuggers

### React Developer Tools

This is the main React-specific debugger.

Use the browser extension:
- Chrome: React Developer Tools
- Firefox: React Developer Tools

What it is good for:
- inspecting component props
- inspecting local state
- inspecting hook values
- inspecting context
- checking which component is rendering what

For this feature, the most useful components are:
- [panel.tsx](/Users/andrei/Dev/btm-hub/src/app/(dashboard)/admin/admin-ai/panel.tsx)
- [question-form.tsx](/Users/andrei/Dev/btm-hub/src/app/(dashboard)/admin/admin-ai/question-form.tsx)
- [message-list.tsx](/Users/andrei/Dev/btm-hub/src/app/(dashboard)/admin/admin-ai/message-list.tsx)
- [answer-view.tsx](/Users/andrei/Dev/btm-hub/src/app/(dashboard)/admin/admin-ai/answer-view.tsx)
- [thread-list.tsx](/Users/andrei/Dev/btm-hub/src/app/(dashboard)/admin/admin-ai/thread-list.tsx)

What it is not good for:
- stepping through JavaScript line by line
- showing general execution flow like a normal debugger

So if you want to see:
- `what is the current value of this hook/state/prop?`
  - use React DevTools
- `how did execution get here?`
  - use the browser Sources debugger

### React DevTools Profiler

This is the second React-specific tool.

Use it when you want to understand:
- which components re-rendered
- when they rendered
- why they rendered
- how expensive the render was

Good for:
- render loops
- unexpected re-renders
- slow admin panels

Less useful for:
- server action bugs
- AI pipeline bugs
- database retrieval bugs

### Is There A React-Only Step Debugger?

Not really.

There is no special React debugger that replaces the normal browser debugger for execution flow.

The practical combination is:
- `React DevTools` for component tree, hooks, props, and state
- browser `Sources` tab for breakpoints, stepping, call stacks, and local variables
- `Profiler` for render timing / render flow

That is the normal and recommended setup.

## Browser Debugging For React Code

### 1. Use React DevTools Components Tab

Open the `Components` tab and inspect:
- current props
- hook state
- context values

For this feature, useful things to inspect:
- selected thread
- loaded messages
- pending state in the form
- whether provider availability is disabling the form

### 2. Use The Browser Sources Tab

This is how you inspect execution flow.

Use:
- breakpoints
- conditional breakpoints
- `debugger;`
- call stack
- local variables
- step over / step into / step out

Best use cases:
- click handlers
- state transitions
- client-side rendering bugs
- UI not updating after a server action resolves

Useful places for breakpoints:
- [panel.tsx](/Users/andrei/Dev/btm-hub/src/app/(dashboard)/admin/admin-ai/panel.tsx)
- [question-form.tsx](/Users/andrei/Dev/btm-hub/src/app/(dashboard)/admin/admin-ai/question-form.tsx)
- [message-list.tsx](/Users/andrei/Dev/btm-hub/src/app/(dashboard)/admin/admin-ai/message-list.tsx)

### 3. Use The Network Tab

When you click `Ask AI`, check:
- whether the POST request fired
- how long it took
- whether it failed
- whether the browser finished the request but the UI did not update

For App Router + server actions, the payload is not always pleasant to read, but timing and failure signal are still useful.

### 4. Use Console Logging In Client Code

For client components:
- `console.log` goes to the browser console
- `debugger;` pauses in the browser debugger

Use this sparingly, but it is often the fastest way to inspect a state transition.

## Debugging Server-Side Next.js Code

For this feature, a lot of the important work is server-side.

### Terminal Logs

For:
- server actions
- query planning
- retrieval
- dossier/ranking rebuilds
- provider calls
- persistence

`console.log` in server code goes to the terminal running `npm run dev`.

This is the fastest way to debug most App Router issues.

### Full Server Debugger

If you want true step-debugging for server-side code, run Node with an inspector and attach from Chrome DevTools or VS Code.

A common pattern is:

```bash
NODE_OPTIONS="--inspect" npm run dev
```

Then attach a debugger to the Node process.

This is useful when terminal logs are not enough, but for day-to-day App Router debugging, logs are usually faster.

## Admin AI Pipeline: What To Inspect At Each Step

The admin AI flow is easiest to debug if you think of it as 7 steps.

### Step 1: UI Input

File:
- [question-form.tsx](/Users/andrei/Dev/btm-hub/src/app/(dashboard)/admin/admin-ai/question-form.tsx)

Inspect:
- `scope`
- `contactId`
- `threadId`
- question text
- pending / disabled state

Suggested temporary log:

```ts
console.log("[admin-ai] submit", {
  scope,
  contactId,
  threadId,
});
```

### Step 2: Server Action Boundary

File:
- [actions.ts](/Users/andrei/Dev/btm-hub/src/app/(dashboard)/admin/admin-ai/actions.ts)

Inspect:
- parsed form values
- validation result
- thread creation vs thread reuse
- final serialized payload returned to the client

Suggested temporary log:

```ts
console.log("[admin-ai] action input", {
  scope,
  contactId,
  question,
});
```

### Step 3: Query Planning

File:
- [query-plan.ts](/Users/andrei/Dev/btm-hub/src/lib/admin-ai/query-plan.ts)

Inspect:
- `mode`
- `structuredFilters`
- `textFocus`
- `requestedLimit`

This is one of the most important debugging points, because a lot of “AI answered strangely” problems start here.

Suggested temporary log:

```ts
console.log("[admin-ai] query plan", JSON.stringify(queryPlan, null, 2));
```

### Step 4: Retrieval / Memory Assembly

Files:
- [contact-retrieval.ts](/Users/andrei/Dev/btm-hub/src/lib/admin-ai-memory/contact-retrieval.ts)
- [global-retrieval.ts](/Users/andrei/Dev/btm-hub/src/lib/admin-ai-memory/global-retrieval.ts)
- [admin-ai-retrieval.ts](/Users/andrei/Dev/btm-hub/src/lib/data/admin-ai-retrieval.ts)

Inspect:
- was a dossier found
- was a ranking card found
- did rebuild-on-read trigger
- how many candidates were loaded
- how many evidence rows were loaded
- did recent-chunk fallback run

Suggested temporary logs:

```ts
console.log("[admin-ai] contact memory", {
  contactId,
  hasDossier: !!dossier,
  evidenceCount: resolvedEvidence.length,
  fallbackUsed,
});
```

```ts
console.log("[admin-ai] global memory", {
  candidateCount: candidates.length,
  rankingCardCount: validRankingCards.length,
  contactsMissingRankingCards,
});
```

### Step 5: Model Call

Files:
- [provider.ts](/Users/andrei/Dev/btm-hub/src/lib/admin-ai/provider.ts)
- [dossier-generator.ts](/Users/andrei/Dev/btm-hub/src/lib/admin-ai-memory/dossier-generator.ts)

Inspect:
- which model was used
- number of candidates
- number of dossiers
- number of evidence rows
- raw model output
- token usage

Suggested temporary log:

```ts
console.log("[admin-ai] provider input", {
  scope,
  candidates: input.candidates.length,
  dossiers: input.dossiers.length,
  evidence: input.evidence.length,
});
```

```ts
console.log("[admin-ai] provider usage", modelMetadata?.usage);
```

If something is wrong with grounding, this is where to check:
- did the model receive raw evidence
- did it return citations
- did it return citations that actually exist

### Step 6: Orchestration

File:
- [orchestrator.ts](/Users/andrei/Dev/btm-hub/src/lib/admin-ai/orchestrator.ts)

Inspect:
- which path ran: contact vs global
- did insufficient-evidence short-circuit trigger
- shortlist ids
- citation resolution
- whether final message persistence succeeded

Suggested temporary logs:

```ts
console.log("[admin-ai] finalists", shortlist);
console.log("[admin-ai] citations resolved", citations.length);
```

### Step 7: Persistence

Best source of truth after the request finishes:
- `admin_ai_threads`
- `admin_ai_messages`
- `admin_ai_message_citations`
- `crm_ai_evidence_chunks`
- `crm_ai_contact_dossiers`
- `crm_ai_contact_ranking_cards`

This is how you answer questions like:
- what exactly did the assistant return
- what citations were persisted
- what dossier existed at the time
- what evidence chunks existed

## What To Check In The Database

### Final answer path

Use these tables:
- `admin_ai_threads`
- `admin_ai_messages`
- `admin_ai_message_citations`

Look for:
- latest thread
- latest assistant message
- `response_json`
- `model_metadata`
- citations count and snippets

### Memory layer

Use these tables:
- `crm_ai_evidence_chunks`
- `crm_ai_contact_dossiers`
- `crm_ai_contact_ranking_cards`

Look for:
- whether the contact has chunks
- whether the contact has a dossier
- whether the contact has a ranking card
- whether `stale_at` is set

## Practical Debug Order For This Feature

When something is wrong, use this order:

1. Reproduce in `npm run dev`
2. Check browser console
3. Check terminal logs
4. Check Network tab timing / failures
5. Inspect React state in React DevTools
6. Inspect DB rows for thread/message/citation
7. Inspect DB rows for chunks/dossier/ranking card
8. Add one temporary log at the exact failing step

That order is usually faster than trying to reason from the UI alone.

## Recommended Debugging Improvement For The Repo

Right now, the fastest debugging is still ad hoc logs.

If you want better repeatability, add a dev-only debug flag such as:

```bash
DEBUG_ADMIN_AI=1
```

Then guard detailed logs behind it.

Even better, write step snapshots to a temp folder:

```text
/tmp/admin-ai-debug/
  01-action.json
  02-query-plan.json
  03-retrieval.json
  04-provider-input.json
  05-provider-output.json
```

That makes it much easier to compare runs and understand exactly what changed between:
- a good answer
- a bad answer
- a no-evidence answer

## Best Tools Summary

If you only remember one setup, use this:

- `React DevTools` for props, state, hooks, and render tree
- browser `Sources` debugger for execution flow and variable values
- browser `Network` tab for request timing/failures
- terminal logs for server-side Next.js / AI pipeline behavior
- direct DB inspection for persisted truth

That is the most practical debugging workflow for this app.
