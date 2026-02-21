import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg", "pg-boss", "pdf-parse"],
};

export default nextConfig;
