import type { NextConfig } from "next";

const apiUrl = process.env.API_URL;
if (!apiUrl) throw new Error("API_URL is not set. Copy web/.env.example to web/.env.local.");

const nextConfig: NextConfig = {
  // The browser only ever calls /api on our own domain, so cookies stay first party and the API needs no CORS.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiUrl.replace(/\/$/, "")}/:path*` }];
  },
};

export default nextConfig;
