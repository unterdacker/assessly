import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Resolve @/* path aliases from tsconfig.json natively
    alias: {
      "@": new URL(".", import.meta.url).pathname.replace(/\/$/, ""),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "lib/**/*.test.ts"],
    exclude: ["tests/e2e/**", "node_modules/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: ["lib/**/*.ts"],
      exclude: [
        "lib/prisma.ts",
        "lib/env.ts",
        "lib/mail.ts",
        "lib/pdf-utils.ts",
        "lib/sms/providers/sinch.ts",
        "lib/sms/providers/infobip.ts",
        "lib/ai/**",
        "lib/queries/**",
        "lib/ensure-demo-data.ts",
        "lib/audit-middleware.ts",
        "lib/types/**",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
});
