import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");
const isWindows = process.platform === "win32";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-XSS-Protection", value: "0" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

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
  async headers() {
    return [
      {
        // Apply security headers to all routes including /api/*
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
  webpack: (config, { dev }) => {
    if (isWindows && dev) {
      config.cache = false;
    }

    return config;
  },
};

export default withNextIntl(nextConfig);
