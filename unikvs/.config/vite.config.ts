import { defineConfig } from "vite-plus";

import proposalDecorators from "./_proposal-decorators.js";

export default defineConfig({
  pack: {
    dts: {
      generator: "oxc",
      sourcemap: true,
    },
    entry: ["../src/index.ts"],
    format: ["esm"],
    outDir: "../dist",
    target: "es2020",
    plugins: [proposalDecorators()],
    platform: "neutral",
    tsconfig: "tsconfig.build.json",
    sourcemap: true,
    fixedExtension: false,
  },
});
