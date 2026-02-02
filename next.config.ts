import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ['@prisma/client', 'better-sqlite3', '@prisma/adapter-better-sqlite3'],
  // typescript: {
  //   ignoreBuildErrors: true,
  // },
};

export default nextConfig;
