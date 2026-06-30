import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Bundles a minimal standalone server (+ only the node_modules actually
  // used) into .next/standalone — what the Docker image runs, instead of
  // shipping the full node_modules tree.
  output: "standalone",
};

export default nextConfig;
