# Vercel → Hostinger migration plan

**Status:** **CUTOVER EXECUTED 2026-07-12 — production now runs on Hostinger at `https://preview.behind-the-mask.com`** (interim production URL; official launch on the final domain still pending — see the Launch runbook). Vercel kept warm ~30 days as rollback (until ~2026-08-11). Phases 0/1/2 done; Phase 3 executed against the interim URL. History below: v2 red-team review; BLOCKED 2026-07-02 on a third-party-account/trust issue (⚠️ section) — proceeded on the third-party box with key-rotation under Andrei's own accounts as the kill-switch.
**Builds on:** branch `chore/hostinger-portability` (2 commits, unmerged — analytics removal, `APP_ENV` prod detection, Node pin) and its analysis doc `docs/plans/hostinger-migration-overhead.md`.

## Cutover executed 2026-07-12 — production now runs on preview.behind-the-mask.com

Production moved to **`https://preview.behind-the-mask.com`** on Hostinger — commit **`4f16157`** deployed (build `019f562d-04e1-724e-ae6e-216162fbd8b4`). This is the **INTERIM production URL**; the official launch on the final domain is still pending (see **Launch runbook** below). What Phase 3 called "cutover" is done except for the final-domain repoint.

**Env model decision — `APP_ENV` deliberately NOT set.** Leaving `APP_ENV` unset keeps the preview URL **noindexed pre-launch** (the noindex header keys off `APP_ENV !== "production"`). Production email semantics are instead enforced via **`EMAIL_REQUIRE_REAL_PROVIDER=true` + `EMAIL_PROVIDER=brevo`** — `isProductionEmailEnvironment()` treats that flag as production, so fake-provider fallback is forbidden and real sends go out. **`APP_ENV=production` is the launch-day switch** (drops noindex + belt-and-suspenders prod detection).

**Env-store drift incident (lesson).** The hPanel env store was a **Jul-2 snapshot predating the DeepSeek provider switch**, so the admin AI silently fell back to the old OpenAI provider (quota-dead key) on the pilot. Fixed by syncing against the Vercel dashboard — added `ADMIN_AI_PROVIDER`, `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL`, `DEEPSEEK_BASE_URL`, `DEEPSEEK_REASONING_EFFORT`, `DEEPSEEK_THINKING`, `ADMIN_AI_SCAN_MODE`. **LESSON: the hPanel env store does NOT track Vercel** — any new env var must be added in **BOTH** places until Vercel is decommissioned.

**External references repointed (all verified working):**
- **Supabase Vault URLs → preview:** `email_drain_url`, `conversation_digest_url`, `whatsapp_media_archive_url`; **new `academy_import_url` created**. (The plan predated the digest + media-archive crons — live `cron.job` now has **5 jobs**.)
- **pg_cron `academy-import`** scheduled `15 2 * * *` (jobid 5) **AFTER** the vercel.json cron-removal commit `4f16157` landed (ordering per the script header — no double-execution window).
- **email-drain verified:** `200 {"ok":true,"sends":[]}` every minute against preview → CRON_SECRET / Vault parity confirmed.
- **Brevo** transactional webhook (id `1980683`) → `https://preview.behind-the-mask.com/api/email/webhooks/brevo`.
- **Supabase Auth Site URL** → preview (Andrei, dashboard).
- **YCloud WhatsApp webhook RE-ENABLED** → preview `/api/whatsapp/ycloud/webhook` (deactivated since the Jun 29 fluid-burn; the storm-proofed code is now live).
- **Sanity revalidate webhook** → preview (Andrei, dashboard).
- **Stream webhook — FINDING:** the dashboard webhook pointed at a **dead ngrok dev tunnel** — chat `message.new` notifications were **silently broken in production for an unknown period**. Repointed to preview `/api/stream/webhook` (`message.new` is the only event the route handles — correct as-is).

**Verification results (2026-07-12):**
- Smoke: `/`→200, `/login`→200, `/admin`→307.
- **Load:** 60-request / 20-concurrency burst all 200, avg **0.80 s**.
- **Admin AI end-to-end on DeepSeek:** answer in **29 s** server-side — proves the proxy ceiling is **>29 s only**. The 180 s question **remains open**; the documented fallback (background job + poll) still stands if a real >proxy-cap request appears.
- **Real email send:** `12:27:15Z` → Brevo → `delivered_at 12:27:18Z`, delivered status applied via the **repointed** Brevo webhook (validates the full send→webhook→DB loop on preview).

## Context

BTM Hub runs on **Vercel Hobby** at `btm-hub.vercel.app` (no custom domain). Two forcing functions:

1. **Hobby is non-compliant and at pause risk — treat as urgent.** Vercel's fair-use policy restricts Hobby to non-commercial use; the shop makes this site commercial. The June 29 YCloud webhook retry storm burned **482.9/360 GB-hrs provisioned memory and 4h36m/4h active CPU** — both exceeded. Per [Vercel's Hobby docs](https://vercel.com/docs/plans/hobby), exceeding usage limits can suspend the feature **until 30 days have passed**. Production may pause at any moment; Phase 0/1 should be executed in days, not weeks (see Break-glass below).
2. **A Hostinger Cloud Startup plan is already paid for and sits empty.** Hostinger's Node.js Web Apps hosting runs Next.js (SSR/ISR/API routes) from a GitHub repo with auto-deploy on push, Node 18–24, env-var UI, managed SSL, CDN, supervising process manager. Plan: **4 CPU / 4 GB RAM / 100 GB NVMe**, all available to this app.

**Verdict: technically feasible.** Standard `next start` server; Vercel coupling in app code is confined to `src/lib/email/settings.ts` + the analytics imports (verified). Trade-offs: no PR previews, undocumented proxy request-timeout (pilot test), self-served image optimization, build-memory headroom on a 4 GB builder (measured, mitigated below).

## ⚠️ BLOCKING — the Hostinger account belongs to a third party (raised 2026-07-02)

The Cloud Startup plan and `behind-the-mask.com` are owned by **someone else**, and there is an **unresolved money dispute** with them. This changes the recommendation and must be resolved before any deploy.

- **There is no reliable "kill-switch" on hardware someone else administers.** Deploying runs `npm ci && next build` onto *his* filesystem (hPanel File Manager / SSH), exposing in plaintext: the full source code (he can snapshot it any time — deleting it later doesn't un-copy it) and — the real crown jewel — **all env secrets, above all `SUPABASE_SERVICE_ROLE_KEY`** (full DB read/write, bypasses RLS; also Brevo/OpenAI/YCloud keys). Any kill-switch written in code is defeatable because it's his machine. He also controls DNS (the domain is his).
- **The only ungameable kill-switch lives in accounts *you* own.** Rotating the Supabase service-role + anon keys instantly bricks any deployed copy (can't auth, read, or send). Same for rotating Brevo/OpenAI/YCloud. **This only works if the Supabase project `ojbwpfemujjjkihdhgkr` is under Andrei's own account — MUST VERIFY (open decision #2).**
- **Recommended path: host on Andrei's OWN plan** (a separate ~$8/mo Cloud Startup, or Vercel Pro ~$20/mo). The entire cost saving was "the plan is already paid for" — which is void once it's not his account. Own plan = own server, own DNS, own keys, clean exit any time. Do NOT weaponize access as dispute leverage (legal risk; out of scope) — the goal is simply to not hand an untrusted party your code + data-keys.
- **Two open decisions gate everything below** (asked 2026-07-02, awaiting answer): (1) host on his account / own new plan / stay on Vercel Pro; (2) who controls Supabase. Phase 0 code is done and host-agnostic, so it is unaffected regardless. Phase 1 does not proceed until (1) and (2) are settled.

## Decisions made (Andrei, 2026-07-01)

- Pilot on **`preview.behind-the-mask.com`** (decided 2026-07-02, supersedes the temp `*.hostingersite.com` idea — equal effort, better URL). External repointing happens **once**, at final cutover (break-glass excepted).
- Cloud Startup plan is empty of *other* Node apps → full resources for this app.
- **Drop Vercel Analytics + Speed Insights** now; replacement later.
- **Domain reality (corrected 2026-07-02):** `behind-the-mask.com` is in the Hostinger account but **hosts the live WordPress brand site** ("Underwater film production & dive travel", WP 7.0 — no repo; it lives in hPanel). The `preview` subdomain has no DNS record — free to claim; subdomain attach does not touch apex/`www`. `btmacademy.com` is NOT owned (NameBright marketplace).
- **Official release (gates Phase 3, Andrei's call):** either (a) hub takes the apex and the WP site is retired or remapped (e.g. `old.`/`films.`), or (b) hub lives permanently on a subdomain (`hub.`/`community.`) and WP keeps the apex. Pilot is valid under both.

## What the app needs from a host (audit summary — verified)

- **Runtime:** Node ≥ 20.9 (Next 16.1.6/React 19.2.3) → **Node 22** on Hostinger. `npm ci` → `next build --webpack` → `next start`. No `output: standalone` needed. Datacenter: **France (or UK)** — Supabase project is in **AWS eu-west-1** (verified via `inet_server_addr()`).
- **Overwhelmingly dynamic SSR** (both top-level layouts read cookies/draftMode); every request hits Supabase, marketing pages also hit Sanity. 49 static-at-build pages; build calls Sanity (`generateStaticParams` ×3).
- **Writable `.next/cache`** for sharp image optimization (23 `next/image` files; remotes: Supabase storage, cdn.sanity.io, YouTube/Vimeo thumbs) + Next data cache. Wiped per deploy — acceptable.
- **No inbound websockets/SSE** (all realtime is browser↔Supabase/Stream/Sanity — matters: Hostinger web hosting only permits *outgoing* websockets). One streaming route: `api/whatsapp/ycloud/media` pipes upstream bytes — verify no proxy buffering.
- **No runtime disk writes in app code; no server-side uploads** (browser→Supabase Storage via TUS). Server actions cap at 6 MB bodies.
- **Long requests:** admin AI holds a request up to **180 s** (`src/lib/admin-ai/provider.ts`); bulk email runs in `after()` post-response. `conversation-digest` route is **scheduled nowhere** (verified: not in vercel.json, not in live `cron.job`).
- **Single-instance constraint:** ~90 `revalidatePath/Tag` sites are correct only against one `.next/cache` → app must run as **one Node process**; scale-up = VPS + Redis `cacheHandler` (see overhead doc §3C).

## Vercel-only features → replacements

| Vercel feature | Used by | Replacement |
|---|---|---|
| Vercel Cron (`vercel.json`) | `/api/cron/academy-import` 02:15 UTC | **pg_cron + pg_net** job (mirror the `email-drain` pattern: `net.http_get`, Bearer from Vault). Cron-removal commit lands **at Phase 3** to avoid double-execution (see findings) |
| `export const maxDuration` (4 routes) | serverless duration hints | **No-op self-hosted** — real protection is per-call `AbortSignal.timeout` (Phase 0 hardening) |
| `VERCEL_ENV === "production"` | `isProductionEmailEnvironment()` | **`APP_ENV=production`** (done on `chore/hostinger-portability`; `VERCEL_ENV` fallback kept so Vercel keeps working during transition) |
| `VERCEL_URL` / `VERCEL_PROJECT_PRODUCTION_URL` | `getPublicSiteUrl()` / `getEmailWorkerOrigin()` (email links, worker self-call); **implicit `metadataBase`** | Set `NEXT_PUBLIC_SITE_URL` + `EMAIL_WORKER_ORIGIN` explicitly; set `metadataBase` from `NEXT_PUBLIC_SITE_URL` (Phase 0) |
| `@vercel/analytics`, `@vercel/speed-insights` | `src/app/layout.tsx` | Removed on `chore/hostinger-portability`; also drop the deps from `package.json` |
| PR preview deploys | workflow | Lost — accepted |
| Vercel image service | `next/image` | Next's in-process sharp (verified working locally via `next start` smoke test) |

## ⚠️ Email-environment model (get this right — SEV-1)

Provider selection is **solely `EMAIL_PROVIDER`** (`getEmailProviderName()`, `src/lib/email/settings.ts:30-43`). Non-production does NOT force the fake provider; production only *forbids* fake. The pilot shares the production DB, so:

- **Pilot default:** `EMAIL_PROVIDER=fake`, no `APP_ENV`. Only exercise the pipeline with **pilot-created** sends. **Never manually hit `/api/cron/email-drain` on the pilot** — the drain processes ANY queued production send with the env-selected provider (fake ⇒ real rows marked sent but never delivered).
- **Real-send test (one, at the end of Phase 2):** flip to `EMAIL_PROVIDER=brevo` + **`EMAIL_TEST_RECIPIENT_OVERRIDE=isailaandrei.i@gmail.com`** (redirects the provider recipient; forbidden only in prod env), redeploy, send one email, flip back.
- Remember: **env changes require a rebuild/redeploy on Hostinger**, and `NEXT_PUBLIC_*` values are baked at build time.

## Phase 0 — Code prep (local branch; no push without approval)

0. Branch off `main` → merge **`chore/hostinger-portability`** into it (brings analytics removal + test guard, `APP_ENV`, `engines`/`.nvmrc`). Also remove `@vercel/analytics` + `@vercel/speed-insights` from `package.json`.
   *(WhatsApp fluid-burn fix already merged — `542b1bb`. YCloud webhook stays deactivated until Phase 3.)*
1. **Harden the Brevo webhook** (`src/app/api/email/webhooks/brevo/route.ts`) to the storm-proofing invariant: 2xx-on-internal-error (currently any DB throw → 5xx → Brevo retries; no try/catch around the `applyEvent` loop), bound every DB call in `src/lib/data/email-sends.ts` with `AbortSignal.timeout` (model: YCloud webhook + `src/lib/data/conversations.ts`).
2. **Bound the unbounded external fetches:** Brevo send (`src/lib/email/provider/brevo.ts:112`), worker self-trigger (`src/lib/email/worker-trigger.ts:7`), YCloud media proxy (`api/whatsapp/ycloud/media/route.ts:52`), Vimeo oEmbed (`src/lib/films/posters.ts:65`).
3. **Pilot noindex:** send `X-Robots-Tag: noindex` when `APP_ENV !== "production"` (via `next.config.ts` headers or proxy) — the pilot is otherwise a publicly indexable clone of production (no robots.ts/sitemap exists).
4. **Set `metadataBase`** from `NEXT_PUBLIC_SITE_URL` in root layout metadata.
5. **Pre-write the server-actions escape hatch:** keep a ready one-liner for `experimental.serverActions.allowedOrigins` in case Hostinger's proxy breaks the Origin/x-forwarded-host check (would block ALL forms incl. login).
6. **Review Stream webhook 500-on-missing-mapping** (`api/stream/webhook/route.ts:74-79`) — possibly intentional retry-until-ready; at minimum add DB timeouts.
7. **Align CI Node to 22** (`.github/workflows/ci.yml` currently pins 20) for build parity.
8. Housekeeping (optional): delete dead `src/lib/email/send.ts` + `resend` dep; add `.env.example`.
9. Prepare (as repo files, NOT executed): `supabase/scripts/academy-import-cron.sql` mirroring `email-backstop-cron.sql` (pg_cron `15 2 * * *` → `net.http_get` academy-import with Vault bearer), for Phase 3.
10. Verify: lint, typecheck, unit tests, `npm run build` + `next start` smoke.
    *(Baseline measured 2026-07-02: build 39 s cold/23 s warm, peak RSS 3.3 GB cold / 2.2 GB warm; `next start` serves SSR+Sanity, proxy.ts redirects, sharp image optimization — all green.)*

## Phase 1 — Deploy pilot to Hostinger

1. hPanel → Websites → **Add Website → Node.js Apps** → Import Git Repository → `isailaandrei/btm-hub`, the Phase 0 branch (pushed with approval). Datacenter **France (or UK)**.
2. Build settings: install `npm ci`, build `npm run build`, start **`npm run start`** (plain — Hostinger docs say apps must listen on **port 3000**, which is `next start`'s default and it honors a platform `PORT` env var; `-p $PORT` relies on an undocumented variable and crashes if unset). Node **22**. Add build env **`NODE_OPTIONS=--max-old-space-size=2048`** (measured: caps cold-build peak at ≈3 GB vs 3.3–3.6 GB, no time penalty).
3. Env vars (list below), pilot values: `NEXT_PUBLIC_SITE_URL`/`EMAIL_WORKER_ORIGIN` = `https://preview.behind-the-mask.com`; **no `APP_ENV`**; **`EMAIL_PROVIDER=fake`** (see email model above); all secrets present so config checks don't 500/404.
3b. **Attach `preview.behind-the-mask.com`** to the app (same-account subdomain; auto-SSL). The WordPress site on apex/`www` is untouched. Note: the pilot is noindexed but publicly reachable — optional hardening before sharing the URL: a cookie-based preview gate keyed on non-production.
4. **Sanity CORS:** register `https://preview.behind-the-mask.com` at sanity.io/manage (allow credentials) — `/studio` auth fails without it. Remove after cutover.
5. **Supabase: no changes needed for the pilot.** The app never passes `redirectTo`/`emailRedirectTo` (plain `signInWithPassword`/`signUp` — verified), so password login works as-is. Expect: **new registrations on the pilot get confirmation emails linking to the Vercel Site URL** until Phase 3 — known cosmetic weirdness, not a Hostinger failure.

## Phase 2 — Pilot validation checklist (in order)

- [x] **1. Submit the login form** — server actions behind their proxy (Origin vs x-forwarded-host). **DONE (pilot + 2026-07-12): works through the proxy, no `allowedOrigins` fix needed.**
- [x] Auth session across navigation; `/admin` gate via `proxy.ts`; logout — **DONE (`/admin`→307 verified 2026-07-12)**
- [ ] Marketing pages render Sanity content; `/studio` loads (after CORS step)
- [x] Admin dashboard incl. Supabase Realtime; community pages; Stream Chat connects — **DONE: admin dashboard verified; Stream webhook repointed 2026-07-12**
- [x] **Timeout ceiling (decisive):** run an admin-AI question >60 s; find the proxy's request cap. **PARTIAL 2026-07-12: admin AI answered end-to-end on DeepSeek in 29 s — proxy cap proven >29 s only; the 180 s question stays OPEN, background+poll fallback still on the table**
- [ ] `/_next/image` optimizes (sharp) — check hPanel CPU during an image-heavy page burst
- [ ] WhatsApp media proxy streams (no buffering) — **not re-verified at cutover; low risk (storm-proofed code live, YCloud webhook re-enabled)**
- [x] Email: pipeline-shape then the **one real send** — **DONE 2026-07-12: real send `12:27:15Z` → Brevo → `delivered_at 12:27:18Z` on preview (prod semantics now via `EMAIL_REQUIRE_REAL_PROVIDER=true`; the old `fake`/`EMAIL_TEST_RECIPIENT_OVERRIDE` pilot dance is retired)**
- [x] Webhook signature checks — **DONE 2026-07-12: Brevo webhook (id `1980683`) repointed to preview and validated end-to-end by the real send's delivered-status apply; no duplicate left behind**
- [x] ~~Manually hit `/api/cron/academy-import` with `Bearer CRON_SECRET`~~ — **SUPERSEDED: live email-drain returns 200 every minute against preview + `academy-import` pg_cron scheduled (jobid 5); CRON_SECRET/Vault parity confirmed**
- [ ] 6 MB server-action body passes the proxy — **not re-verified at cutover; low risk**
- [x] Light load (~20 concurrent SSR) — **DONE 2026-07-12: 60-request / 20-concurrency burst all 200, avg 0.80 s**
- [x] **Redeploy on push: measure downtime — MEASURED Jul 11 2026: effectively ZERO.**
  Full deploy of origin/main 546009f (upload → 6m22s server build → swap →
  cache purge) polled at ~1s cadence on the CDN path (1,363 samples, all 200)
  AND a controlled `nodejs/server/restart` polled at ~300ms cadence on a
  cache-bypassed origin path (488 samples, all 200). No failed request at
  either layer — the swap/restart holds or drains connections rather than
  dropping them. Caveats: measured at zero concurrent load beyond the poller;
  a request in-flight at the exact swap instant may still see added latency
  (not measured); and the CDN result relies on cached pages continuing to
  serve during the build (which also means STALE pages serve until the purge —
  hence the mandatory post-deploy purge + fixed
  NEXT_SERVER_ACTIONS_ENCRYPTION_KEY, both in place since this deploy).
- [ ] **Single-instance check:** a `revalidatePath` flow propagates (no divergent caches → confirms one worker)
- [ ] No idle-sleep: warm response after >1 h idle
- [ ] Crash recovery: process manager restarts the app

## Phase 3 — Cutover (STRICTLY ORDERED — the drain cron fires every minute)

> **EXECUTED 2026-07-12 against the interim `preview.behind-the-mask.com` URL** (see the Cutover section up top). Steps 1/2/4/5 are done; step 3 (final release hostname) + the final-domain re-repoint are deferred to the **Launch runbook** below. The env in step 1 was applied in the interim variant — `APP_ENV` left UNSET (noindex), prod email semantics via `EMAIL_REQUIRE_REAL_PROVIDER=true`.

1. **Env first, then rebuild:** ~~set final env on Hostinger — `APP_ENV=production`, `EMAIL_PROVIDER=brevo`, remove `EMAIL_TEST_RECIPIENT_OVERRIDE`, `NEXT_PUBLIC_SITE_URL` + `EMAIL_WORKER_ORIGIN` = final domain~~ — **DONE in interim form 2026-07-12**: `EMAIL_PROVIDER=brevo` + `EMAIL_REQUIRE_REAL_PROVIDER=true`, `APP_ENV` UNSET, `NEXT_PUBLIC_SITE_URL`/`EMAIL_WORKER_ORIGIN` = preview URL. The `APP_ENV=production` + final-domain variant runs at launch (Launch runbook).
2. **Land the repo commit** that deletes the cron from `vercel.json` — **DONE: commit `4f16157`** (kills Vercel-side academy-import everywhere; both platforms deploy from main, so no double-execution window).
3. ~~**Attach the release hostname** (hPanel, same-account): either the apex … or the chosen permanent subdomain.~~ **DEFERRED to the Launch runbook** — still gated on the apex-vs-`hub.*` owner decision. Interim production stays on `preview.*`; plan its removal in Phase 4 after launch.
4. **Repoint external references** (~~only now~~ **DONE to preview 2026-07-12 — repeat against the final domain at launch**):
   - Supabase Auth **Site URL** → final domain (fixes confirmation-email links)
   - Supabase **Vault `email_drain_url`** → `https://<domain>/api/cron/email-drain`; **verify the ported `CRON_SECRET` equals Vault `email_cron_secret`** (mismatch = drain 401s forever, emails stall)
   - Run `supabase/scripts/academy-import-cron.sql` (new pg_cron job)
   - Brevo webhook URL; Sanity revalidate webhook + CORS for final domain; Stream webhook (~~**verify it's actually configured in Stream's dashboard first — unverified**~~ **RESOLVED 2026-07-12: it WAS configured but pointed at a dead ngrok dev tunnel — `message.new` chat notifications were silently broken in prod; repointed to preview**); YCloud webhook re-enable → `https://<domain>/api/whatsapp/ycloud/webhook`
   - ~~Community revalidate DB webhook~~ — **does not exist in production** (verified live `pg_trigger`: no `supabase_functions.http_request` trigger). Decide separately whether to create it; nothing to repoint.
5. ~~Re-run the Phase 2 checklist top items against the final domain~~ — **DONE against preview 2026-07-12** (login 200, one real email delivered, Brevo webhook applied the delivered status, drain 200s, academy-import cron scheduled). Repeat at launch against the final domain.

## Launch runbook (final domain — pending owner decision)

The 2026-07-12 cutover put production on the interim `preview.*` URL. **Official launch = repeat the external repoint against the final domain + flip on production indexing.** Blocked on one owner decision: **apex vs `hub.*`** — apex requires deciding WordPress routing FIRST (the apex currently serves the live WP brand site; a `hub.*`/`community.*` subdomain leaves WP on the apex untouched). Steps, in order:

1. **Attach the final hostname** in hPanel (same-account subdomain; or the apex after the WP routing decision — remap WP to `old.`/`films.` first if it should stay reachable).
2. **Set final env + redeploy:** `APP_ENV=production`, `NEXT_PUBLIC_SITE_URL` + `EMAIL_WORKER_ORIGIN` = final URL, then **redeploy** (`NEXT_PUBLIC_*` is baked at build). Keep `EMAIL_REQUIRE_REAL_PROVIDER=true` + `EMAIL_PROVIDER=brevo`. `APP_ENV=production` **drops the noindex header automatically**.
3. **Repoint external references to the final domain** (same list executed at cutover): 4 Supabase Vault URLs (`email_drain_url`, `conversation_digest_url`, `whatsapp_media_archive_url`, `academy_import_url`); Brevo transactional webhook; Supabase Auth Site URL; YCloud WhatsApp webhook; Sanity CORS + revalidate webhook; Stream webhook.
4. **Verify:** login, one real email (send→webhook→`delivered_at`), drain/cron 200s, one webhook event; confirm the noindex header is gone.
5. Then remove `preview.*` per Phase 4.

## Break-glass — if Vercel pauses before cutover

> **HISTORICAL (moot after the 2026-07-12 cutover — Hostinger is now production).** Kept for the record.

Production goes down with no rollback target. Promote the pilot to interim production immediately: set Phase 3 step 1 env on Hostinger (final env but `NEXT_PUBLIC_SITE_URL`/`EMAIL_WORKER_ORIGIN` = temp subdomain), redeploy; flip Supabase Site URL + Vault drain URL to the temp subdomain; announce the temp URL. The "repoint once" decision deliberately bends here. When the real domain lands, repoint again (Phase 3 order).

## Phase 4 — Decommission Vercel

> **Quarantine active as of 2026-07-12 (adjusted).** Vercel stays warm as the rollback target through **~2026-08-11** (~30 days post-cutover). Its cron is already gone (commit `4f16157`); Brevo, Supabase Vault, Stream, and Sanity no longer reference it. Do NOT pause the project (pausing destroys the rollback path).

1. **Keep the Vercel project warm ~30 days** (through ~2026-08-11) as rollback (its cron is already gone via commit `4f16157` — do NOT "pause" the project, pausing destroys the rollback path).
2. **`btm-hub.vercel.app` admin is OFF-LIMITS post-cutover** — it remains a live production write-path (prod DB, real Brevo key, `VERCEL_ENV=production` fallback) until deleted; any admin action there writes real data and diverges caches. Use the Hostinger admin only.
3. After the window: delete the Vercel project; old `btm-hub.vercel.app` links die (acceptable). Remove `vercel.json` remnants from the repo.
4. Remove/redirect the temp `*.hostingersite.com` site (there is no "stop" button for Node apps — removal is the documented way).
5. Ops guardrails: external uptime monitor on `/`; watch hPanel CPU/RAM after YCloud re-enable (storms now cost CPU, not money); runtime logs live in hPanel.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Vercel pauses production mid-migration | Real (limits already exceeded; 30-day window per Hobby docs) | Break-glass runbook above; execute Phase 0/1 in days |
| Proxy request-timeout <180 s breaks admin AI | Unknown — undocumented | Phase 2 decisive test; fallback: background-job + polling rework |
| Hostinger builder OOM | Medium, measured: cold 3.28–3.57 GB / capped **2.97 GB** / warm 2.21–2.38 GB vs 4 GB box. Turbopack is faster but peaks 3.87 GB — don't switch. Config changes invalidate the build cache (next build is cold again) | `NODE_OPTIONS=--max-old-space-size=2048` build env; steady-state relies on cache; next lever: move Sanity Studio out (`sanity`+`@sanity` ≈ 97 MB of deps in the client bundle); last resort: prebuild in CI |
| Server actions fail behind proxy (Origin check) | Possible | First pilot check + prepared `allowedOrigins` fix |
| Image optimizer CPU under bursts | Low at ~89 K invocations/mo | Hostinger CDN caches; monitor |
| `.next/cache` wiped per deploy | Certain, minor | Site is SSR-dynamic; caches rebuild |
| No PR previews | Certain | Accept |

## Env vars to port

**`NEXT_PUBLIC_*` (baked at build):** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SANITY_PROJECT_ID`, `NEXT_PUBLIC_SANITY_DATASET`, `NEXT_PUBLIC_STREAM_CHAT_API_KEY`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SHOW_ADMIN_AI`.
*(NOT `NEXT_PUBLIC_SANITY_API_VERSION` — phantom; `src/lib/sanity/env.ts:3` hardcodes the apiVersion.)*

**Server:** `SUPABASE_SERVICE_ROLE_KEY`, `SANITY_API_READ_TOKEN`, `SANITY_REVALIDATE_SECRET`, `STREAM_CHAT_API_SECRET`, `STREAM_CHAT_TOKEN_TTL_SECONDS`, `BREVO_API_KEY`, `BREVO_FROM_EMAIL`, `BREVO_WEBHOOK_TOKEN`, `EMAIL_PROVIDER`, `EMAIL_FROM_EMAIL`, `EMAIL_FROM_NAME`, `EMAIL_REPLY_TO_EMAIL`, `EMAIL_WORKER_SECRET`, `EMAIL_WORKER_ORIGIN`, `EMAIL_TEST_RECIPIENT_OVERRIDE` (pilot only), `EMAIL_REQUIRE_REAL_PROVIDER`, `APP_ENV`, `ADMIN_NOTIFICATION_EMAIL`, `OWNER_EMAIL_FORWARD_TO`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_CONVERSATION_DIGEST_MODEL`, `OPENAI_GLOBAL_PROMPT_CACHE_RETENTION`, `ADMIN_AI_INCLUDE_EVIDENCE`, `YCLOUD_API_KEY`, `YCLOUD_WEBHOOK_SECRET`, `CRON_SECRET`, `COMMUNITY_WEBHOOK_SECRET`, `DEFAULT_PHONE_REGION`; optional debug: `DEBUG_ADMIN_AI`, `ADMIN_AI_PRINT_OPENAI_PAYLOAD`.
*(Not needed: `RESEND_API_KEY`/`EMAIL_FROM` — dead code; `VERCEL_*` — replaced. Authoritative check at execution: re-derive from `grep -r "process.env." src/` + Vercel dashboard values.)*

## Pilot results (2026-07-02) — live at preview.behind-the-mask.com, deployed via Hostinger MCP

Validated working: build (Next auto-detected, ~2.5 min, no OOM on 4 GB, Node 20), SSR (warm ~0.5 s), `proxy.ts` auth-gating (307→/login), `next/image` sharp optimization, noindex header, SSL+CDN (`hcdn`), login (server actions work through the proxy), admin dashboard with 304 real contacts (service-role key via new `sb_secret_...` key works at runtime), Google Forms academy import (preview flow), Sanity content. Env: user imported the full `.env` into hPanel's env store (Hostinger's encrypted store, takes precedence over the archive file) — the auto-mode guard correctly blocked the assistant from shipping secrets to this third-party box, so the human did it.

**Two findings that become cutover requirements:**
1. **Server Action skew (self-hosting gotcha Vercel auto-handles).** After each redeploy, CDN/browser-cached client bundles reference stale action IDs → "Server Action … was not found" until a fresh load. **Required step: purge the Hostinger CDN cache after every deploy** (scriptable since Jul 2026: `hosting_clearWebsiteCacheV1` MCP tool / `DELETE .../cache/clear` REST (the old `POST` now 405s) — `scripts/hostinger-deploy.sh` does it automatically; manual fallback: hPanel → Dashboard → Cache → Clear cache). Consider also setting a fixed `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` and/or cache-control so the CDN doesn't cache dynamic HTML/RSC. Deploying multiple times in quick succession makes it worse (each build = new IDs).
2. **Admin AI is dev-only-gated, by design.** `admin-ai/visibility.ts` → `isLocalAdminAiEnabled()` requires `NODE_ENV !== "production"`, so it never renders on a production build regardless of `NEXT_PUBLIC_SHOW_ADMIN_AI` or any `?tab=ai` URL (double-gated at `admin-dashboard.tsx:212`). Not a Hostinger issue; matches the global-AI-parked-on-OpenAI-TPM state. To run the **proxy request-timeout test** (the one remaining platform unknown — does Hostinger's proxy kill requests before ~180 s?), the gate must be temporarily relaxed + redeployed. Lower urgency than first framed: the AI isn't production-exposed, and long email work runs in `after()` (post-response), not in-request.

Cosmetic note: hPanel "Last deployment: Build failed" is the redundant duplicate MCP build that lost a race; the app runs the prior **completed** build (verified serving).

## Deploy hardening (Jul 11 2026 — owner-approved)

Decisions and facts from the deploy-model review (Docker/VPS explicitly NOT
worth it at current stakes; revisit only at >1 instance or painful deploy
blips — the recorded scale-up path is VPS + Redis `cacheHandler`):

- **Platform constraint (decisive):** Hostinger's Node.js Apps pipeline
  REQUIRES source-only archives and always builds server-side ("archive must
  ONLY contain application source files"). CI-built artifacts CANNOT be
  uploaded. Consequences: rollback is always a ~2.5 min rebuild of a
  known-good SHA, and the CI build gate (which already runs on every push,
  clean `npm ci`) is the only pre-deploy build verification — check CI is
  green before deploying.
- **Deploy/rollback script:** `scripts/hostinger-deploy.sh` — git-archives a
  SHA, uploads, polls the build (fail-loud; a failed build leaves the
  previous app serving), purges website+CDN cache, smoke-checks
  (`/`→200, `/login`→200, `/admin`→3xx), logs to `.hostinger-deploys.log`
  (gitignored). Rollback = run it with the previous logged SHA. Needs
  `HOSTINGER_API_TOKEN` + `HOSTINGER_USERNAME` env.
- **Server-Action skew, permanent fix:** set `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`
  in the hPanel env store (key generated Jul 11, handed to Andrei via
  `.server-actions-key.local` — NOT in the repo). With a fixed key, action IDs
  survive deploys, so stale cached bundles keep working instead of throwing
  "Server Action not found". The post-deploy cache purge stays (stale
  HTML/RSC), but stops being load-bearing. Optionally set the same key on
  Vercel (dashboard → env) for the same benefit there.
- **REST endpoints** (base `https://developers.hostinger.com/api/hosting/v1`,
  Bearer auth). **Cloudflare note (verified 2026-07-12):** developers.hostinger.com
  is now behind a Cloudflare bot WAF that 403s multipart POSTs and, more
  broadly, any plain Node/Python `fetch`/urllib request (even a GET) — it
  fingerprints the client, and only `curl`-shaped requests pass. So the old
  one-shot `POST .../nodejs/builds/from-archive` (multipart `archive`) is
  **DEAD from scripts**; do the upload+build as a sequence instead, and keep
  every API call on `curl`:
  - `POST .../files/upload-urls` (body `{username, domain}`) → `{url, auth_key, rest_auth_key}`.
  - **TUS upload** the `.tar.gz` to the returned file host (`srv*-files.hstgr.io`,
    NOT Cloudflare-fronted): `POST {url}/{name}?override=true` with `X-Auth`/
    `X-Auth-Rest` + `Upload-Length`/`Upload-Offset:0` (→201), then chunked
    `PATCH` (`application/offset+octet-stream`, `Tus-Resumable:1.0.0`, →204).
    `scripts/hostinger-deploy.sh` does this via the Node companion
    `scripts/hostinger-tus-upload.mjs`.
  - `GET .../nodejs/builds/settings/from-archive?archive_path={name}` → auto-detected settings.
  - `POST .../nodejs/builds` with `{...settings, source_type:"archive", source_options:{archive_path:{name}}}` → `{uuid}`.
  - `GET .../nodejs/builds`, `GET .../nodejs/builds/{uuid}/logs` (poll/logs, unchanged).
  - `DELETE .../cache/clear` (cache purge — the old `POST` now returns **405**).
  - `POST .../nodejs/server/restart` (app restart).
  - **Interactive shortcut:** the `hosting_deployJsApplication` MCP tool runs
    this whole upload+build flow end to end (it is the reference implementation
    the script replicates).

## Open items

- **Final launch domain (apex vs `hub.*`)** — the sole owner decision gating official launch off the interim `preview.*` URL; apex needs the WordPress-routing call first. See the **Launch runbook**.
- **Admin-AI proxy ceiling >180 s** — still unproven; cutover only proved >29 s. Background+poll rework stays on the table if a real long request appears.
- Whether to create the community-revalidate DB webhook (doesn't exist today). ~~Whether to schedule `conversation-digest`~~ — **now scheduled** (Vault `conversation_digest_url` + pg_cron; live `cron.job` has 5 jobs as of 2026-07-12).
- Analytics replacement — deferred
- Scale-up path if >1 instance ever needed: VPS + Redis `cacheHandler`
- **Env-store parity** — the hPanel env store does not track Vercel; add every new env var in both until Vercel is decommissioned (~2026-08-11).
