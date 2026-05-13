import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@workspace/db"],
  serverExternalPackages: ["mysql2"],
};

export default nextConfig;
