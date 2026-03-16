import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "ojbwpfemujjjkihdhgkr.supabase.co" },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
};

/** @type {import('next').NextConfig} */


export default nextConfig;
