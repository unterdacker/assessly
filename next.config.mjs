import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  /** Safer React behaviour for enterprise apps; recommended for App Router. */
  reactStrictMode: true,
  /** Avoid bundling issues with the Prisma query engine in App Router. */
  serverExternalPackages: ["@prisma/client", "prisma", "pdfjs-dist"],
  /** Allow larger PDF uploads in Server Actions (use this carefully). */
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default withNextIntl(nextConfig);
