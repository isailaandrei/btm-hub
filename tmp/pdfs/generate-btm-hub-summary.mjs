import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const outputPath = resolve(
  process.cwd(),
  "output/pdf/btm-hub-app-summary.pdf",
);

mkdirSync(resolve(process.cwd(), "output/pdf"), { recursive: true });

const summary = {
  title: "BTM Hub",
  subtitle: "One-page app summary based on repo evidence",
  whatItIs:
    "BTM Hub is a Next.js web app for Behind The Mask that combines a public ocean brand site with academy program applications and a members-only community. The repo also includes user profiles, direct messaging, admin review tools, and an embedded Sanity Studio for editable content.",
  whoItsFor:
    "Divers, freedivers, underwater photographers and filmmakers, and other ocean enthusiasts who want to learn, connect, and apply for Behind The Mask programs.",
  features: [
    "Publishes marketing pages for films, team, partners, foundation/contact, academy, and community entry points.",
    "Shows academy program pages that merge static program definitions with Sanity-managed rich content.",
    "Collects multi-step academy applications with schema-based validation and tracks each user's submission status.",
    "Runs an authenticated community forum with topic feeds, search, posting, replies, likes, moderation, and pagination.",
    "Supports member profiles and one-to-one direct messaging with unread counts and read-state support.",
    "Gives admins tools to review applications, change status, add tags and notes, and browse user profiles.",
    "Embeds Sanity Studio at /studio and uses revalidation endpoints for CMS and community updates.",
  ],
  architectureBullets: [
    "UI and routes: Next.js 16 App Router serves marketing, academy, community, profile, admin, API, and /studio routes.",
    "Data layer: page components and server actions call src/lib/data/* fetchers and form handlers.",
    "Core services: Supabase handles auth/session cookies, Postgres tables/views/RPC/storage for profiles, applications, forum, and direct messages; src/lib/supabase/proxy.ts protects member routes.",
    "Content: Sanity provides films, team, partners, and program content through next-sanity, with embedded Studio, draft mode, and revalidation endpoints.",
  ],
  architectureFlow:
    "Typical flow: page or action -> data layer -> Supabase or Sanity -> server component render -> webhook or revalidation refresh.",
  runSteps: [
    "Install dependencies with npm install.",
    "Copy .env.local.supabase.example to .env.local.supabase, then set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    "In .env.local, add NEXT_PUBLIC_SANITY_PROJECT_ID and NEXT_PUBLIC_SANITY_DATASET. Actual values: Not found in repo.",
    "Optional local backend: run supabase start. SANITY_API_READ_TOKEN is only needed for draft mode.",
    "Start the app with npm run dev:local or npm run dev, then open http://localhost:3000.",
  ],
};

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

const featureItems = summary.features
  .map((item) => `<li>${escapeHtml(item)}</li>`)
  .join("");

const runItems = summary.runSteps
  .map((item) => `<li>${escapeHtml(item)}</li>`)
  .join("");

const architectureItems = summary.architectureBullets
  .map((item) => `<li>${escapeHtml(item)}</li>`)
  .join("");

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(summary.title)} Summary</title>
    <style>
      @page {
        size: Letter;
        margin: 0.34in;
      }

      :root {
        --ink: #0f172a;
        --muted: #475569;
        --line: #dbe4ee;
        --panel: #f8fafc;
        --accent: #0f766e;
        --accent-soft: #ccfbf1;
      }

      * {
        box-sizing: border-box;
      }

      html, body {
        margin: 0;
        padding: 0;
        color: var(--ink);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: white;
      }

      body {
        font-size: 11px;
        line-height: 1.34;
      }

      .page {
        min-height: 9.92in;
        display: grid;
        grid-template-rows: auto 1fr;
        gap: 0.16in;
      }

      .header {
        display: grid;
        gap: 0.08in;
        padding: 0.16in 0.18in 0.14in;
        border: 1px solid var(--line);
        border-radius: 14px;
        background:
          linear-gradient(135deg, rgba(15, 118, 110, 0.1), rgba(255, 255, 255, 0.95)),
          white;
      }

      .eyebrow {
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--accent);
      }

      h1 {
        margin: 0;
        font-size: 25px;
        line-height: 1;
      }

      .subtitle {
        margin: 0;
        color: var(--muted);
        font-size: 11px;
      }

      .content {
        display: grid;
        grid-template-columns: 2.15fr 3.35fr;
        gap: 0.16in;
      }

      .column {
        display: grid;
        gap: 0.14in;
      }

      .card {
        border: 1px solid var(--line);
        border-radius: 12px;
        padding: 0.13in 0.15in;
        background: white;
      }

      .card.tint {
        background: linear-gradient(180deg, var(--panel), white 46%);
      }

      h2 {
        margin: 0 0 0.07in;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.07em;
        text-transform: uppercase;
        color: var(--accent);
      }

      p {
        margin: 0;
      }

      ul {
        margin: 0;
        padding-left: 0.16in;
      }

      li {
        margin: 0 0 0.055in;
        padding-left: 0.015in;
      }

      li:last-child {
        margin-bottom: 0;
      }

      .persona {
        display: inline-block;
        padding: 0.035in 0.07in;
        border-radius: 999px;
        background: var(--accent-soft);
        color: #134e4a;
        font-weight: 700;
      }

      .foot {
        margin-top: 0.08in;
        font-size: 9px;
        color: var(--muted);
      }

      .flow {
        margin-top: 0.08in;
        padding-top: 0.08in;
        border-top: 1px solid var(--line);
      }
    </style>
  </head>
  <body>
    <main class="page">
      <section class="header">
        <div class="eyebrow">Product Snapshot</div>
        <h1>${escapeHtml(summary.title)}</h1>
        <p class="subtitle">${escapeHtml(summary.subtitle)}</p>
      </section>

      <section class="content">
        <div class="column">
          <section class="card tint">
            <h2>What It Is</h2>
            <p>${escapeHtml(summary.whatItIs)}</p>
          </section>

          <section class="card">
            <h2>Who It's For</h2>
            <p class="persona">Primary persona</p>
            <p style="margin-top: 0.08in;">${escapeHtml(summary.whoItsFor)}</p>
          </section>

          <section class="card tint">
            <h2>How To Run</h2>
            <ul>${runItems}</ul>
            <p class="foot">Local backend helper files exist in the repo. Deployment setup beyond this: Not found in repo.</p>
          </section>
        </div>

        <div class="column">
          <section class="card">
            <h2>What It Does</h2>
            <ul>${featureItems}</ul>
          </section>

          <section class="card tint">
            <h2>How It Works</h2>
            <ul>${architectureItems}</ul>
            <p class="flow">${escapeHtml(summary.architectureFlow)}</p>
          </section>
        </div>
      </section>
    </main>
  </body>
</html>`;

const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 1660 },
    deviceScaleFactor: 2,
  });

  await page.setContent(html, { waitUntil: "load" });
  await page.emulateMedia({ media: "print" });
  await page.pdf({
    path: outputPath,
    format: "Letter",
    printBackground: true,
    preferCSSPageSize: true,
  });

  console.log(outputPath);
} finally {
  await browser.close();
}
