import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");
const isWindows = process.platform === "win32";
const isProd = process.env.NODE_ENV === "production";

// ---------------------------------------------------------------------------
// Security headers — applied to every route including /api/*
// ---------------------------------------------------------------------------
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-XSS-Protection", value: "0" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
];

// ---------------------------------------------------------------------------
// Aggressive immutable caching for static assets.
// "immutable" tells browsers + CDNs never to revalidate; safe because Next.js
// appends a content-hash to every file under /_next/static/.
// ---------------------------------------------------------------------------
const immutableCacheHeaders = [
  {
    key: "Cache-Control",
    value: "public, max-age=31536000, immutable",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // -------------------------------------------------------------------------
  // Core flags
  // -------------------------------------------------------------------------
  /** Safer React behaviour for enterprise apps; recommended for App Router. */
  reactStrictMode: true,
  /**
   * Produces a self-contained output in .next/standalone that includes only
   * the files required to run the app. Required for the Docker runner stage.
   */
  output: "standalone",
  trailingSlash: false,
  skipTrailingSlashRedirect: true,
  /** Never expose which framework is running to external clients. */
  poweredByHeader: false,

  // -------------------------------------------------------------------------
  // Built-in Gzip compression (middleware-level, for Node.js `next start`).
  // Compression level is not configurable here — for finer control over Brotli
  // quality/Gzip level in production, delegate to your reverse proxy or CDN
  // (nginx: brotli_comp_level / gzip_comp_level; Cloudflare: auto).
  // -------------------------------------------------------------------------
  compress: true,

  // -------------------------------------------------------------------------
  // Compiler transforms (SWC)
  // removeConsole strips console.log/debug/info in production bundles while
  // preserving console.error and console.warn for runtime monitoring.
  // -------------------------------------------------------------------------
  compiler: {
    removeConsole: isProd ? { exclude: ["error", "warn"] } : false,
  },

  // -------------------------------------------------------------------------
  // Packages that must stay server-side and must NOT be bundled by webpack.
  // -------------------------------------------------------------------------
  /** Avoid bundling issues with the Prisma query engine in App Router. */
  serverExternalPackages: ["@prisma/client", "prisma", "pdfjs-dist"],

  // -------------------------------------------------------------------------
  // Experimental flags
  // ppr: "incremental" — Partial Prerendering opt-in per route (Next.js ≥ 15).
  // Add `export const experimental_ppr = true` to any route segment to enable
  // it selectively; avoids accidental PPR on routes that aren't ready yet.
  // -------------------------------------------------------------------------
  experimental: {
    /** Allow larger PDF uploads in Server Actions (use this carefully). */
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },

  // -------------------------------------------------------------------------
  // HTTP response headers
  // -------------------------------------------------------------------------
  async headers() {
    return [
      {
        // Security headers on every route
        source: "/(.*)",
        headers: securityHeaders,
      },
      {
        // Next.js content-hashed chunks — safe to cache for 1 year
        source: "/_next/static/(.*)",
        headers: immutableCacheHeaders,
      },
      {
        // Public-folder web fonts
        source: "/fonts/(.*)",
        headers: immutableCacheHeaders,
      },
      {
        // Public-folder icons / PWA icons
        source: "/icons/(.*)",
        headers: immutableCacheHeaders,
      },
      {
        source: "/favicon.ico",
        headers: immutableCacheHeaders,
      },
    ];
  },

  // -------------------------------------------------------------------------
  // Webpack overrides
  // -------------------------------------------------------------------------
  webpack: (config, { dev }) => {
    // Disable persistent filesystem cache on Windows dev to avoid EPERM
    // rename-lock issues with .cache files on NTFS.
    if (isWindows && dev) {
      config.cache = false;
    }

    return config;
  },
};

export default withNextIntl(nextConfig);
