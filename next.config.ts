import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

// A deployment is "production" if either the portable APP_ENV signal (Hostinger
// / VPS) or Vercel's VERCEL_ENV says so. Everything else — the Hostinger pilot
// (no APP_ENV), Vercel preview deploys, local dev — is non-production. BOTH
// signals are checked on purpose: checking only APP_ENV would deindex the live
// Vercel production site (which sets VERCEL_ENV, not APP_ENV) during the
// migration, and checking only VERCEL_ENV would fail to recognise Hostinger
// production. Evaluated at build time, which is correct on both platforms
// because env vars are set before `next build`.
const isProductionDeployment =
  process.env.APP_ENV === "production" ||
  process.env.VERCEL_ENV === "production";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "ojbwpfemujjjkihdhgkr.supabase.co" },
      { protocol: "https", hostname: "cdn.sanity.io" },
      { protocol: "https", hostname: "i.ytimg.com", pathname: "/vi/**" },
      { protocol: "https", hostname: "i.vimeocdn.com", pathname: "/video/**" },
    ],
  },
  outputFileTracingRoot: projectRoot,
  turbopack: {
    root: projectRoot,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '6mb',
      // OPERATIONAL RUNBOOK — do NOT enable unless Server Actions break behind
      // Hostinger's reverse proxy. Next validates the request Origin against the
      // Host / x-forwarded-host header for every Server Action; a proxy that
      // rewrites Host (or drops x-forwarded-host) fails that check and breaks
      // ALL forms — including login and register — with an "Invalid Server
      // Actions request" error. If Phase 2's login test fails this way, uncomment
      // and list the pilot/production origin(s):
      // allowedOrigins: ["<subdomain>.hostingersite.com", "behind-the-mask.com"],
    },
    staleTimes: {
      // Keep prefetched/visited dynamic routes (e.g. real-route opens of
      // /admin/contacts/[id] via cmd-click, deep links, browser back) briefly
      // in the client Router Cache. In-app navigation uses the explicit
      // session cache instead, which is the source of truth.
      dynamic: 30,
      static: 300,
    },
  },
  async headers() {
    // Non-production deployments (the Hostinger pilot, previews, local) are a
    // publicly crawlable clone of production and there is no robots.ts/sitemap,
    // so keep them out of search indexes. Production returns no extra header.
    if (isProductionDeployment) return [];
    return [
      {
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
