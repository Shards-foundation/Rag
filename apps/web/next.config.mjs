import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const directory = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(directory, "../../.env") });

const apiOrigin = (process.env.API_URL || "http://localhost:3001").replace(/\/$/, "");

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@lumina/ui"],
  async rewrites() {
    return [
      { source: "/api/trpc/:path*", destination: `${apiOrigin}/trpc/:path*` },
      { source: "/api/chat/stream", destination: `${apiOrigin}/api/chat/stream` },
    ];
  },
};

export default nextConfig;
