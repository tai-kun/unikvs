import { defineConfig } from "vitest/config";

export default defineConfig({
  oxc: {
    target: "es2020",
  },
  test: {
    coverage: {
      provider: "istanbul",
      enabled: true,
      include: ["src/**/*.ts"],
      reporter: ["text", "json-summary", "lcov"],
      reportsDirectory: "./coverage/bun",
      thresholds: {
        lines: 93,
        statements: 93,
        functions: 100,
        branches: 62,
      },
    },
    include: ["tests/**/*.test.ts"],
    hookTimeout: 30e3,
    testTimeout: 30e3,
  },
});
