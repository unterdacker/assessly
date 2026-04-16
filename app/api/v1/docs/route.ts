import "server-only";
import crypto from "crypto";
import { type NextRequest } from "next/server";
import { readClientIp } from "@/lib/rate-limit";
import { consumeIpRequest } from "@/lib/api-rate-limit";
import { AuditLogger } from "@/lib/structured-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SWAGGER_UI_VERSION = "5.18.2";
const CDN_BASE = `https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_UI_VERSION}`;

function buildHtml(nonce: string, cdnBase: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>VenShield API Documentation</title>
  <link rel="stylesheet" href="${cdnBase}/swagger-ui.css" />
  <style>
    body { margin: 0; }
    #swagger-ui .topbar { display: none; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="${cdnBase}/swagger-ui-bundle.js"></script>
  <script src="${cdnBase}/swagger-ui-standalone-preset.js"></script>
  <script nonce="${nonce}">
    window.onload = function() {
      window.ui = SwaggerUIBundle({
        url: "/api/v1/openapi.json",
        dom_id: "#swagger-ui",
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
        ],
        layout: "StandaloneLayout"
      });
    };
  </script>
</body>
</html>`;
}

export async function GET(request: NextRequest): Promise<Response> {
  const ip = readClientIp({ get: (name: string) => request.headers.get(name) });
  if (consumeIpRequest(ip)) {
    return new Response("Too Many Requests", {
      status: 429,
      headers: { "Retry-After": "60" },
    });
  }

  // Audit log docs access
  AuditLogger.systemHealth("OPENAPI_DOCS_ACCESSED", "success", {
    sourceIp: ip,
    details: { endpoint: "/api/v1/docs" },
  });

  // Generate a cryptographic nonce for inline script CSP
  const nonce = crypto.randomBytes(16).toString("base64");

  return new Response(buildHtml(nonce, CDN_BASE), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow",
      // Manual CSP — middleware excludes /api routes
      "Content-Security-Policy": [
        "default-src 'self'",
        `script-src 'self' 'nonce-${nonce}' ${CDN_BASE}/`,
        `style-src 'self' 'unsafe-inline' ${CDN_BASE}/`,
        `img-src 'self' data:`,
        "connect-src 'self'",
        "font-src 'self'",
        "frame-ancestors 'none'",
      ].join("; "),
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    },
  });
}
