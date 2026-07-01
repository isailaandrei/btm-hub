# Vercel → Hostinger: Feasibility & Migration Overhead

_Analysis date: 2026-07-01. App: Next.js 16.1.6 (App Router) · React 19 · Supabase · Sanity · Stream Chat._

## TL;DR

- **Staying on Vercel Hobby is not a real option** — its Fair Use policy bans commercial use, and BTM Hub is commercial. The honest comparison is **Hostinger vs Vercel _Pro_ (~$20/seat/mo + usage)**, not vs Hobby.
- **The app self-hosts cleanly.** It's written statelessly, uses no edge runtime, writes nothing to local disk, and its Vercel coupling is tiny (3 spots). This is a low-risk port at the *code* level.
- **The cost of the move is almost entirely _ops_, not code.** ~1 day of code/config + 1–2 days of first-time infra setup, then ongoing operational responsibility (deploys, patching, monitoring, manual rollback).
- **Recommended target: Hostinger VPS KVM 2 (~$9/mo) or KVM 4 (~$15/mo)**, not Cloud Startup — because a VPS can run Redis (needed to scale past one Node process while keeping `revalidatePath` correct) and gives root for webhook rate-limiting. **Cloud Startup (already paid) is a viable zero-extra-cost managed fallback**, but caps you at effectively one instance.
- **The real risk is capacity, not feasibility.** No Hostinger plan autoscales; you trade Vercel's elastic-but-billed compute for fixed-capacity-but-flat-cost. Given "spiky/growing" traffic, plan for CDN caching + vertical headroom.

---

## 1. Feasibility verdict: YES

Hostinger now ships a first-class Node.js/Next.js app product (GitHub-import builds, persistent "Running" server, Node **22.x**, advertised SSR/ISR/API-route support, free CDN in front). Combined with the codebase audit below, running this app there is a supported path, not a hack.

**Green flags found in the audit:**

| Concern | Finding | Verdict |
|---|---|---|
| Edge runtime to port | None — all routes `export const runtime = "nodejs"` (Stream routes explicit; rest default to Node) | ✅ Nothing to convert |
| Cross-request in-memory state | None — every `new Map`/`new Set` is request-scoped, a read-only constant, or client-side | ✅ Stateless; safe on a shared process |
| Local filesystem dependency | None in app code — uploads use `tus-js-client` → **Supabase Storage** | ✅ Only `.next/cache` needs a writable dir |
| `after()` background work | 5 sites (`admin/email/process`, `cron/email-drain`, `admin/email/actions.ts` ×3) | ✅ *More* reliable on a persistent server than on serverless |
| External integrations | Supabase, Sanity, Stream, Resend/Brevo, OpenAI, YCloud — all cloud APIs | ✅ Host-agnostic; zero change |

---

## 2. Cost comparison (monthly, approximate)

| Option | Price | Commercial-OK? | Capacity |
|---|---|---|---|
| Vercel Hobby | $0 | ❌ **Banned** | Autoscale; hard caps (360 GB-hr mem, 4h active CPU, 1M invocations, 100 GB transfer, 5k image transforms) |
| Vercel Pro | **$20/seat + usage** | ✅ | Autoscale; you pay for spikes & webhook storms |
| Hostinger Cloud Startup *(owned)* | ~$8 (already paid) | ✅ | Fixed 4 vCPU / 4 GB, managed panel |
| Hostinger VPS KVM 2 | ~$9 | ✅ | Fixed 2 vCPU / 8 GB, root/self-managed |
| Hostinger VPS KVM 4 | ~$15 | ✅ | Fixed 4 vCPU / 16 GB, root/self-managed |

The June 2026 webhook incident (~482 GB-hr Fluid/day) is instructive: on **Pro** that's a *bill*; on a **fixed Hostinger box** it's a *downtime risk* if it saturates the cores. The existing storm-proofing invariant (bounded `AbortSignal.timeout` + always-2xx) matters **more** after the move, and should be paired with nginx/Cloudflare rate-limiting on webhook routes.

---

## 3. Migration overhead — the actual work

### 3A. Code / config changes (small — ~1 day incl. tests)

| # | Change | Files | Effort |
|---|---|---|---|
| 1 | Remove or replace Vercel analytics (they no-op / make dead calls off-Vercel) | `src/app/layout.tsx` (`@vercel/analytics`, `@vercel/speed-insights`), `layout.test.ts` | 15 min |
| 2 | Replace `VERCEL_ENV` / `VERCEL_URL` / `VERCEL_PROJECT_PRODUCTION_URL` with explicit env (`NEXT_PUBLIC_SITE_URL`, an `APP_ENV`) | `src/lib/email/settings.ts` + its tests, `api/email/webhooks/brevo/route.test.ts`, `send-pipeline.test.ts` | ~1–2 h |
| 3 | Set `EMAIL_WORKER_ORIGIN` (or rely on `NEXT_PUBLIC_SITE_URL`) to the app's own URL so `triggerEmailWorker()` self-calls resolve | env only (`src/lib/email/worker-trigger.ts` unchanged) | 5 min |
| 4 | Ensure `sharp` is installed for image optimization; point image cache at a persistent dir | `package.json` / deploy config | 30 min |
| 5 | Pin Node 22 (`engines` + `.nvmrc`) | `package.json`, `.nvmrc` | 10 min |
| 6 | (If deploying via zip/Docker rather than GitHub-import) add `output: "standalone"` | `next.config.ts` | 15 min |

That's the **entire** code surface. Note `maxDuration` exports (`admin/email/process`=60, `whatsapp/ycloud/webhook`=20, `cron/email-drain`=60, `cron/email-reconcile`=60) are Vercel hints — they become **no-ops** on a persistent server, so no edit needed, but their *intent* (bounding work) now depends entirely on the in-code timeouts.

### 3B. Infrastructure / ops changes (the real overhead)

| Item | Vercel (today) | Hostinger | Notes |
|---|---|---|---|
| **Env vars** (~30 server vars) | Vercel dashboard | Re-enter in hPanel / VPS env | Must be complete — fail-loud means partial config breaks loudly |
| **Cron: `academy-import`** | `vercel.json` | New hPanel/system cron: `curl -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron/academy-import` | Only 1 cron lives in Vercel |
| **Cron: email-drain / email-reconcile / conversation-digest** | Supabase **pg_cron** → HTTP | Same, but update the target URL in the pg_cron job definitions | Host-agnostic; just repoint the URL |
| **Build** | Vercel CI | GitHub-import build on-box, or `npm run build` via SSH | `next build --webpack` is RAM-hungry — tight at 4 GB (Cloud Startup), comfortable on KVM 2/4 |
| **Process mgmt** | Managed | PM2 (VPS) / LiteSpeed-managed (Cloud Startup) | VPS = you own restarts/log rotation |
| **Reverse proxy + SSL** | Managed | nginx + certbot (VPS) / built-in (Cloud Startup) | Free Let's Encrypt either way |
| **DNS cutover** | Vercel | Point domain to Hostinger, provision SSL, then flip | Confirm where DNS is managed (`btmacademy.com`) |
| **CDN** | Global edge (automatic) | Free CDN for static assets; consider Cloudflare in front for `/_next/image` + page cache | Absorbs anonymous marketing-page spikes |

### 3C. Behavioral caveats to design around

1. **On-demand revalidation across multiple instances (the #1 caveat).** `revalidatePath`/`revalidateTag` is used at ~90 sites (community, profile, admin/contacts, admin/email, tags, applications, academy import). On a **single** Node process it's correct against `.next/cache`. Run **multiple** workers (PM2 cluster, or >1 box) and revalidation in one worker won't invalidate the others → stale reads. Fix = a shared **`cacheHandler`** backed by **Redis/Valkey**. → **VPS can run Redis locally; Cloud Startup cannot.** This is the decisive scaling factor.
2. **Single-process CPU concurrency.** `next start` is one JS thread. I/O-bound SSR concurrency is fine, but CPU-bound rendering serializes. Using all cores means multiple workers → see caveat #1. Vercel hid this via per-request isolation.
3. **Image optimization load.** 16 `next/image` uses, no `unoptimized`, no custom loader. Self-hosted, `sharp` runs on the origin (CPU/RAM per unique transform, cached to disk). Mitigate by offloading to Sanity/Supabase URL transforms and/or caching `/_next/image` at Cloudflare.
4. **Webhook storms → downtime, not billing.** Keep the storm-proofing invariant and add rate-limiting at the proxy. The YCloud webhook (`maxDuration=20`) is the known offender.
5. **`proxy.ts` (Supabase session refresh) runs in Node, not edge.** Functionally identical; marginally higher latency. No change.

---

## 4. Cloud Startup vs VPS — the call

| | Cloud Startup (owned) | VPS KVM 2 / KVM 4 |
|---|---|---|
| Extra cost | $0 (already paid) | ~$9 / ~$15 |
| Ops burden | Low (managed panel) | Higher (root: OS patching, nginx, PM2, certbot) |
| Always-on guarantee | Implied, **idle behavior undocumented** | Yes (PM2) |
| Run Redis (→ multi-instance revalidation) | ❌ No | ✅ Yes |
| Multi-core scaling | Effectively single instance | PM2 cluster + shared cache |
| `next build` at scale | Tight on 4 GB | Comfortable (8/16 GB) |
| Webhook rate-limiting | Limited | Full (nginx) |

**Recommendation:** VPS **KVM 2** as the best-value fit (headroom to grow, Redis, root), stepping to **KVM 4** if load testing shows the SSR/image/webhook mix needs it. Use **Cloud Startup** if you want zero extra spend and a managed panel now, accepting the single-instance ceiling and verifying idle behavior first.

---

## 5. Suggested cutover (once a target is chosen)

1. Make the 3A code changes on a branch; keep tests green.
2. Stand up a **staging** app on Hostinger (subdomain), full env, deploy from a branch.
3. **Load test** the realistic mix: SSR marketing pages, admin dashboard, image optimization, and a simulated webhook burst. Confirm the box holds and (VPS) Redis-backed revalidation stays consistent across workers.
4. Repoint pg_cron URLs + create the `academy-import` cron; verify all four fire.
5. DNS cutover with SSL; keep Vercel warm as instant rollback for 48–72 h.
6. Decommission Vercel (or downgrade) once stable.

---

## 6. Open items to verify before committing (can't be settled from docs alone)

- **Cloud Startup idle/keep-alive behavior** — does the LiteSpeed-managed Node process idle out? (Hurts webhook/cron cold-start latency.) VPS+PM2 sidesteps this.
- **Cloud Startup NPROC / entry-process limit** — constrains any multi-worker setup.
- **`next build --webpack` peak memory vs 4 GB** on Cloud Startup — may force building elsewhere and uploading.
- **Where DNS is currently managed** for the production domain (cutover logistics).
