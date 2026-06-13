# Admin Dashboard Redesign — Design + Implementation Plan (2026-06-12)

Self-contained handoff document. All decisions below were made with Andrei during a
brainstorming session on 2026-06-12 (visual mockups reviewed in browser); do not re-litigate
them without asking. Execute top to bottom.

## Goal

Modernize the admin dashboard (`/admin`): move section navigation (Contacts, Email, Tasks,
Tags, AI Agent, Users) into a left sidebar, fix the dated "rectangular" button look, and give
the dashboard its own theme, separate from the marketing site.

## Root cause of the dated look (verified)

- The project uses the shadcn `radix-maia` style (`components.json`), whose Button uses
  `rounded-4xl` (= `calc(var(--radius) * 2.6)`) and is designed around `--radius: 0.625rem`
  → pill buttons.
- `src/app/globals.css` sets `--radius: 0.3125rem` (5px), so `rounded-4xl` collapses to
  ~13px and every component reads as a slightly-rounded rectangle. One variable flattens the
  whole UI.
- The admin tab nav in `src/app/(dashboard)/admin/admin-dashboard.tsx` is a hand-rolled
  horizontal row of raw `<button>` elements (`rounded-lg px-4 py-2`), not shadcn Buttons.

## Decisions (final — made by Andrei)

1. **Radius**: extra-soft, `--radius: 0.875rem` (14px). Buttons fully pill, cards very
   rounded. Chosen over the radix-maia default 0.625rem.
2. **Theme scope**: **dashboard-only**. A scoped CSS-variable block (`.theme-admin`) on the
   admin shell. Marketing site, auth pages, and profile keep the current 5px look — do NOT
   change `:root`.
3. **Shell**: dedicated full-height admin app shell using the **shadcn Sidebar, `variant="inset"`**
   (sidebar on a muted frame, content floats as a large rounded card). Marketing Navbar and
   Footer are removed from admin pages.
4. **Theme**: "Ocean Light" — keep the brand cyan primary (`oklch(0.609 0.126 221.723)`),
   shift neutrals from pure gray to a subtle blue tint (hue ~230). Light mode only; no dark
   mode work in this project.
5. **Navigation**: sidebar panel items use a **URL query param** (`/admin?tab=...`), not pure
   client state and not separate routes. Preserves today's mounted-panel behavior while making
   tabs bookmarkable with working back button.

## Current architecture (verified 2026-06-12)

- `src/app/(dashboard)/layout.tsx` renders marketing `Navbar` + `Footer` + `<main class="min-h-screen bg-muted px-5 py-10 md:px-24 md:py-16">`
  around both `profile/` and `admin/`.
- `src/app/(dashboard)/admin/layout.tsx` does the role check: `getProfile()` from
  `@/lib/data/profiles`, redirect to `/` unless `role === "admin"`, wraps children in
  `AdminDataProvider` (`initialPreferences={profile.preferences}`).
- `src/app/(dashboard)/admin/page.tsx` renders `AdminDashboard`
  (`admin-dashboard.tsx`, client component) which owns:
  - `activeTab` state: `"contacts" | "ai" | "tags" | "tasks" | "email"`;
  - hand-rolled tab nav (to be deleted);
  - lazy `dynamic()` panels: `TagsPanel`, `EmailStudio`, `TasksPanel`, `AdminAiDashboardPanel`
    (AI shown only when `isLocalAdminAiEnabled()` from `./admin-ai/visibility` is true);
  - the keep-mounted pattern: `hasVisitedAi/Email/Tasks` + `<div hidden={...}>` so panel state
    survives tab switches;
  - `handleSendEmail(contactIds)` — ContactsPanel hands selected contact IDs to EmailStudio
    and switches to the email tab (`emailContactIds` state).
- Real admin routes besides `/admin`: `/admin/users/page.tsx` and `/admin/contacts/[id]/page.tsx`.
  Other dirs under `admin/` (tags, tasks, email, applications, imports, admin-ai) are panels/
  components, not pages.
- Existing shadcn ui components in `src/components/ui/`: badge, button, card, checkbox,
  dialog, popover, select, separator, sheet, skeleton, sonner, spinner, table, tooltip
  (+ custom BrandButton, RoundedButton, Tag). **No `input.tsx`, no `sidebar.tsx`, no
  `use-mobile` hook** — the sidebar install will add these.
- `globals.css` already defines all `--sidebar-*` tokens in `:root` and `.dark`, and the
  radius scale via `@theme inline` (`--radius-4xl: calc(var(--radius) * 2.6)` etc.). Because
  the theme block is `inline`, utilities resolve `var(--radius)` at the element, so a scoped
  `.theme-admin { --radius: ... }` cascades correctly — no Tailwind config changes needed.
- Auth/session: `src/proxy.ts` + `src/lib/supabase/proxy.ts` protect routes by URL path
  (`protectedPaths`). Route-group changes do not affect URLs, so the proxy needs no changes.

## Target design

### 1. Route restructure

Move `src/app/(dashboard)/admin/` → `src/app/(admin)/admin/` (new route group). URL stays
`/admin`. This is the only clean way to drop Navbar/Footer, since parent layouts always render.

- The moved `admin/layout.tsx` keeps the role check + `AdminDataProvider`, and now also
  renders the sidebar shell (below).
- Add `error.tsx` and `loading.tsx` under `(admin)/` (admin currently inherits the ones in
  `(dashboard)/`, which it will lose).
- Profile stays in `(dashboard)/` untouched.
- Imports use `@/` aliases or stay relative within the moved dir, so the move is low-risk;
  fix any that break. Check for code importing admin modules by full path
  (e.g. tests, `src/lib/admin/*`) and update.

### 2. Sidebar shell

Install: `npx shadcn@latest add sidebar` (adds `sidebar.tsx`, `input.tsx`, `hooks/use-mobile`;
reuses existing sheet/tooltip/skeleton/separator/button). Review the generated code like any
other vendored component.

Admin layout structure:

```tsx
<div className="theme-admin">
  <SidebarProvider>
    <AdminSidebar />            {/* client component, variant="inset" */}
    <SidebarInset>{children}</SidebarInset>
  </SidebarProvider>
</div>
```

`AdminSidebar` (new file, e.g. `(admin)/admin/admin-sidebar.tsx`, client):

- Header: "BTM Admin" brand, links back to `/`.
- Nav group "Workspace": Contacts, Email, Tasks, Tags, AI Agent (render AI item only when
  `isLocalAdminAiEnabled()`), with lucide icons.
- Nav item Users → `/admin/users`.
- Footer: user name/avatar + sign-out (reuse the existing sign-out action used by AuthButtons).
- Active state: for panel items compare the `tab` search param (default `contacts` on
  `/admin` with no/invalid param); for Users match pathname; `/admin/contacts/[id]`
  highlights Contacts.
- Mobile: shadcn Sidebar handles the sheet breakpoint automatically; keep a `SidebarTrigger`
  in a slim content header (with breadcrumb) inside each page.

### 3. Query-param tab navigation

In `AdminDashboard`:

- Delete the `<nav>` tab bar and `TABS` array (the sidebar replaces them).
- Derive `activeTab` from `useSearchParams().get("tab")`; validate against the allowed set
  (`contacts | ai | tags | tasks | email`, `ai` only when the local flag is on); anything else
  falls back to `"contacts"`. Per the fail-loud rule, an explicitly invalid value should not
  silently pretend to be contacts in dev — `console.warn` once.
- Keep the keep-mounted `hasVisited*` pattern, derived from tab changes (e.g. accumulate
  visited tabs in state as the param changes — React 19: no setState-in-useEffect; derive
  with the "previous value in state" pattern).
- `handleSendEmail(contactIds)` keeps setting `emailContactIds` state, then navigates with
  `router.push("/admin?tab=email")`. Same page instance → state survives.
- Sidebar panel items are `<Link href="/admin?tab=...">`.

### 4. Scoped Ocean Light theme

Add to `globals.css` (starting values — fine-tune visually against the running app; the
inset variant uses `--sidebar` as the outer frame color and `--background` as the floating
content card):

```css
.theme-admin {
  --radius: 0.875rem;
  --background: oklch(1 0 0);              /* content card: white */
  --sidebar: oklch(0.965 0.008 230);       /* outer frame + sidebar */
  --sidebar-accent: oklch(0.93 0.012 230); /* hover/active item bg */
  --muted: oklch(0.965 0.008 230);
  --border: oklch(0.91 0.005 230);
  --input: oklch(0.91 0.005 230);
  --sidebar-border: oklch(0.9 0.008 230);
  /* primary stays the brand cyan from :root — do not override */
}
```

- No component file changes for theming — shadcn components re-skin from the variables.
- Delete admin-local raw `<button>` styling where encountered and use the shadcn `Button`
  (variants: default/outline/ghost) so everything picks up the theme. Do this for buttons
  touched by this work; don't do a blind sweep of all panels.
- The Maily email canvas (`.email-maily-editor` block in globals.css) must keep its fixed
  white styling — it previews real email rendering and must not inherit the admin theme.
- The old `(dashboard)/layout.tsx` `bg-muted` page padding no longer applies to admin; the
  inset shell supplies its own spacing.

### 5. Explicitly out of scope / unchanged

- Panel internals and data flow: ContactsPanel, EmailStudio, TasksPanel, TagsPanel, AI panel,
  `AdminDataProvider`, all `src/lib/data/*` fetchers.
- Marketing site, auth pages, profile (`:root` tokens unchanged, `--radius` stays 0.3125rem
  globally).
- Dark mode.
- No new routes; `/admin/users` and `/admin/contacts/[id]` keep their pages (they render
  inside the new shell automatically after the move).

## Implementation order (suggested phases, each with tests green before the next)

0. **Pre-work**: the working tree has substantial uncommitted admin-AI work touching
   `admin-dashboard.tsx` and `globals.css`. Get that committed/landed first (ask Andrei), then
   create a feature branch for this redesign BEFORE the first commit (house rule). Never push
   without explicit approval (house rule).
1. **Theme block + sidebar install**: add `.theme-admin` CSS, run sidebar install, verify
   build. Low risk, independently committable.
2. **Route move**: relocate `(dashboard)/admin` → `(admin)/admin`, add error/loading
   boundaries, fix imports, all existing tests pass (test files move along; update any
   hardcoded paths).
3. **Shell**: admin layout renders SidebarProvider/AdminSidebar/SidebarInset inside
   `.theme-admin`; old tab nav still present temporarily — page should render in shell.
4. **Query-param tabs**: rewire `AdminDashboard`, delete tab bar, sidebar links live, update
   `admin-dashboard.test.tsx` (mock `next/navigation` `useSearchParams`/`useRouter`), add
   tests for param validation/fallback and for active-state logic.
5. **Polish pass**: convert touched raw buttons to shadcn `Button`, content header with
   `SidebarTrigger` + breadcrumb, mobile sheet check, visual tune of the Ocean Light values.

Verification: `npm run lint`, `npm run test:unit`, `npm run build`, and a manual pass on
`/admin` (all five tabs, contacts→email handoff, `/admin/users`, a contact detail page,
mobile viewport). E2E if configured: sidebar renders, tab click updates URL, back button
returns to previous tab.

## Risks / gotchas

- `useSearchParams` in a client component requires a `<Suspense>` boundary at the page level
  in the App Router — wrap `AdminDashboard` accordingly or Next will warn at build.
- Don't break the contacts→email handoff: it relies on `AdminDashboard` staying mounted while
  the `tab` param changes. Navigating to `/admin/users` and back legitimately resets it (same
  as today).
- React 19 rule (house): no setState inside useEffect for the visited-tabs accumulation —
  use the previous-value-in-state pattern.
- `admin-dashboard.test.tsx` and `page.test.ts` exist and will need path + navigation-mock
  updates; `src/test/mocks/supabase.ts` provides the Supabase mock; mock
  `@/lib/auth/require-admin` directly (house testing conventions, see CLAUDE.md).
- After the move, double-check nothing else imports from `(dashboard)/admin/...` literal
  paths (grep for `(dashboard)/admin`).
