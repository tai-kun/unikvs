import { defineConfig } from "vite-plus";
import { playwright } from "vite-plus/test/browser-playwright";

export default defineConfig({
  oxc: { target: "es2020" },
  pack: {
    dts: {
      generator: "oxc",
      sourcemap: true,
    },
    entry: ["../src/index.ts"],
    format: ["esm"],
    outDir: "../dist",
    target: "es2020",
    platform: "browser",
    tsconfig: "tsconfig.build.json",
    sourcemap: true,
    fixedExtension: false,
  },
  test: {
    include: ["tests/**/*.test.ts"],

    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }, { browser: "firefox" }, { browser: "webkit" }],
    },
    coverage: {
      include: ["src/**/*.ts"],

      provider: "istanbul",
      reporter: ["text", "json-summary", "html"],
      reportsDirectory: "./coverage",
    },
  },
});
