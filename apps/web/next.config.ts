import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // PATCH/generate payloads; resume upload uses /api/jobs/.../resume instead
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
