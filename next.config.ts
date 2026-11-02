import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Seed and reference data are read by server code only.
  serverExternalPackages: ["postgres", "bcryptjs"],
};

export default nextConfig;
