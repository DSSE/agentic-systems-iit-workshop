import type { NextConfig } from "next";

const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  // Above the backend's 25-second chat-turn deadline, so a slow LLM turn ends with the fallback reply, not a proxy 500.
  experimental: { proxyTimeout: 40_000 },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backendUrl}/api/:path*` }];
  },
};

export default nextConfig;
