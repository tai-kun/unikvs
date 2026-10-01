import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

import isDebugMode from "./_is-debug-mode.js";

export default defineConfig({
  oxc: {
    target: "es2020",
  },
  define: {
    __DEBUG__: `${isDebugMode}`,
    __CLIENT__: "true",
    __SERVER__: "false",
  },
  test: {
    coverage: {
      provider: "istanbul",
      enabled: true,
      include: ["src/**/*.ts"],
      reporter: ["text", "json-summary", "lcov"],
      reportsDirectory: "./coverage/client",
      thresholds: {
        lines: 98,
        statements: 96,
        functions: 90,
        branches: 100,
      },
    },
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/**/*.server.test.ts"],
    browser: {
      provider: playwright(),
      enabled: true,
      headless: true,
      instances: [{ browser: "chromium" }, { browser: "firefox" }],
    },
    setupFiles: [".config/_debugging.ts"],
  },
});
