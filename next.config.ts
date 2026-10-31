import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Netlify's @netlify/plugin-nextjs handles the build output; standalone
  // output is not needed. TypeScript checks stay ENABLED.
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: false,
  },
  // Allows a verification build to run beside the dev server without
  // touching its .next directory (NEXT_DIST_DIR=.next-build).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Externalized so their native/dynamic-require internals are traced
  // correctly into serverless bundles. @prisma/adapter-pg + pg route all
  // database traffic through node-postgres (see src/lib/db.ts).
  serverExternalPackages: ["@netlify/blobs", "bcryptjs", "@prisma/adapter-pg", "pg"],
  images: {
    remotePatterns: [],
  },
};

export default nextConfig;
