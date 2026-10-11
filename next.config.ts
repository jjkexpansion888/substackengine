import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.SUBSTACK_DIST_DIR || ".next",
};

export default nextConfig;
