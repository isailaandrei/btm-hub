# Ticket: batch the contact-page deep-link loads (kill the serial action chain)

**Status:** Open — not started. Independent of the Hostinger migration; improves every host.
**Origin:** 2026-07-03 perf diagnosis on the Hostinger pilot (see `docs/plans/vercel-to-hostinger-migration.md` § Pilot results).

## Problem

A **cold** open of `/admin/contacts/[id]` (pasted URL, refresh, bookmark, notification link — anything
that isn't in-app navigation) takes seconds to fully populate because the page loads its data as
**~10 sequential server-action round-trips**:

- The SSR render embeds only the bootstrap (`getContactDetailBootstrap`: contact + applications +
  events) via `contact-detail-cache-seeder.tsx`.
- Every other section is a client component that lazy-loads its own slice on mount via its own server
  action: `contact-email-section.tsx` (`loadContactEmailSection`), `application-card.tsx`
  (`loadContactApplication`), tags status, `contact-detail-realtime.tsx` resync
  (`loadContactDetailAction`), plus the admin workspace provider's own loads.
- React executes server actions **serially per client** (by design), so the round-trips queue
  head-to-tail.

**Measured (2026-07-03, foreground-verified, heavy contact `4d8c7f87…`):**
| Host | per action | all data loaded |
|---|---|---|
| Vercel (US functions → Supabase Dublin) | ~1.1 s | **12.2 s** |
| Hostinger UK (→ Supabase Dublin ~12 ms) | ~0.35 s | **5–7 s** steady state |

In-app navigation is unaffected (hover-prefetch via `warmContactDetail` + the session cache short-
circuit the chain) — which is why this was invisible until deep links were used on the pilot.

## Proposed fix

Extend the SSR bootstrap to cover the sections, and make the section components **read seeded data
first**, falling back to their existing lazy action only on cache miss / refresh:

1. `src/lib/data/contact-detail.ts` — extend `getContactDetailBootstrap` (or add a
   `getContactPageData`) to also fetch, **in parallel** (`Promise.all`): email-section status,
   application detail for the primary application, tag state. Server-side these are ~12 ms queries;
   parallel cost ≈ the slowest one.
2. `src/app/(admin)/admin/contacts/[id]/page.tsx` + `contact-detail-cache-seeder.tsx` — seed the
   extended payload into the session cache stores the sections read from.
3. Section components (`contact-email-section.tsx`, `application-card.tsx`, tags manager) — accept
   seeded data; keep their server actions for refresh/realtime resync (that's what they're good at).
   Follow the exact pattern `ContactDetailPanel` already uses (`useSyncExternalStore` + store).
4. Leave `contact-detail-realtime.tsx` resync behavior unchanged.

**Non-goals:** don't parallelize React's action transport (fighting the framework); don't touch the
admin workspace provider's own loading (separate concern); no changes to in-app nav (already fast).

## Acceptance

- Cold deep-link to a heavy contact fully populates in **≤ ~1.5 s on the Hostinger pilot** (network
  tab shows ~0 mount-time action POSTs for seeded sections).
- In-app navigation still instant; realtime updates still refresh sections.
- Existing co-located tests updated; new test: sections render from seeded bootstrap without firing
  their action.

## Effort

Moderate — 1 focused session. All files above have co-located tests. Verify with the measurement
recipe from the migration plan (foreground tab! check `performance.getEntriesByType('visibility-state')`
— hidden-tab measurements are invalid; see the Jul 2026 diagnosis).
