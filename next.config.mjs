/** @type {import('next').NextConfig} */
const nextConfig = {
  /** Safer React behaviour for enterprise apps; recommended for App Router. */
  reactStrictMode: true,
  /** Avoid bundling issues with the Prisma query engine in App Router. */
  serverExternalPackages: ["@prisma/client", "prisma"],
};

export default nextConfig;
