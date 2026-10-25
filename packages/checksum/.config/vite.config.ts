import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    dts: {
      generator: "oxc",
      sourcemap: true,
    },
    entry: [
      "../src/index.ts",
      "../src/errors.ts",
      "../src/checksum.ts",
      "../src/md5.ts",
      "../src/sha1.ts",
      "../src/sha224.ts",
      "../src/sha256.ts",
      "../src/sha384.ts",
      "../src/sha512.ts",
    ],
    format: ["esm"],
    outDir: "../dist",
    target: "es2020",
    platform: "neutral",
    tsconfig: "tsconfig.build.json",
    sourcemap: true,
    fixedExtension: false,
  },
});
