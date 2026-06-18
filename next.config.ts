import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

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
};

export default nextConfig;
