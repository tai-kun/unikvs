import { defineConfig } from "vitest/config";

import isDebugMode from "./_is-debug-mode.js";

export default defineConfig({
  oxc: {
    target: "es2020",
  },
  define: {
    __DEBUG__: `${isDebugMode}`,
    __CLIENT__: "false",
    __SERVER__: "true",
  },
  test: {
    coverage: {
      provider: "v8",
      enabled: true,
      include: ["src/**/*.ts"],
      reporter: ["text", "json-summary", "lcov"],
      reportsDirectory: "./coverage/server",
      thresholds: {
        lines: 95,
        statements: 95,
        functions: 81,
        branches: 92,
      },
    },
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/**/*.client.test.ts"],
    setupFiles: [".config/_debugging.ts"],
    hookTimeout: 30e3,
    testTimeout: 30e3,
  },
});
