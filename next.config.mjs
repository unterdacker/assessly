import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");
const isWindows = process.platform === "win32";

/** @type {import('next').NextConfig} */
const nextConfig = {
  /** Safer React behaviour for enterprise apps; recommended for App Router. */
  reactStrictMode: true,
  trailingSlash: false,
  skipTrailingSlashRedirect: true,
  poweredByHeader: false,
  /** Avoid bundling issues with the Prisma query engine in App Router. */
  serverExternalPackages: ["@prisma/client", "prisma", "pdfjs-dist"],
  /** Allow larger PDF uploads in Server Actions (use this carefully). */
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  webpack: (config, { dev }) => {
    if (isWindows && dev) {
      config.cache = false;
    }

    return config;
  },
};

export default withNextIntl(nextConfig);
