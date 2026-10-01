import { defineConfig } from "vitest/config";

export default defineConfig({
  oxc: {
    target: "es2020",
  },
  test: {
    include: ["tests/**/*.test.ts"],
    hookTimeout: 30e3,
    testTimeout: 30e3,
  },
});
