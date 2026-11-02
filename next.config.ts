import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // CLAUDE.md already holds the project rules; do not generate AGENTS.md.
  agentRules: false,
  // Seed and reference data are read by server code only.
  serverExternalPackages: ["postgres", "bcryptjs"],
};

export default nextConfig;
