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
    include: ["tests/unit/**/*.test.ts"],
    exclude: ["tests/e2e/**", "node_modules/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: ["lib/**/*.ts"],
      exclude: ["lib/prisma.ts", "lib/env.ts"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
});
