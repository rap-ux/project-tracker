import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "pdf-parse", "mammoth"],
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
