/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@lumina/ui"],
  eslint: { ignoreDuringBuilds: true },
  async rewrites() {
    return [
      { source: "/api/trpc/:path*", destination: "http://localhost:3001/trpc/:path*" },
      { source: "/api/chat/stream", destination: "http://localhost:3001/api/chat/stream" }
    ];
  },
};
module.exports = nextConfig;