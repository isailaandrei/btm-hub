import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "ojbwpfemujjjkihdhgkr.supabase.co" },
      { protocol: "https", hostname: "cdn.sanity.io" },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '6mb',
    },
    staleTimes: {
      dynamic: 300,
      static: 300,
    },
  },
};

export default nextConfig;
