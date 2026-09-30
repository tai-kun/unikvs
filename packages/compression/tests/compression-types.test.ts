import { expectTypeOf, test } from "vitest";

import type { CompressionFormat } from "../src/compression.js";

test("CompressionFormat は gzip / deflate / deflate-raw のみを表す", () => {
  expectTypeOf<CompressionFormat>().toEqualTypeOf<"deflate" | "deflate-raw" | "gzip">();
});

test("未対応の形式を表す文字列は CompressionFormat に代入できない", ({ expect }) => {
  // 準備と実行
  // @ts-expect-error "brotli" は CompressionFormat に含まれない。
  const format: CompressionFormat = "brotli";

  // 検証
  expect(format).toBe("brotli");
});
