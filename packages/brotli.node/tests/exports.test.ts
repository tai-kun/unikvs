import { describe, expectTypeOf, test } from "vitest";

import Brotli from "../src/brotli.js";
import { UnsupportedRuntimeError, BrotliInvalidLevelError } from "../src/errors.js";
import * as index from "../src/index.js";
import type {
  UnsupportedRuntimeErrorArgs,
  UnsupportedRuntimeErrorMeta,
  BrotliInvalidLevelErrorArgs,
  BrotliInvalidLevelErrorMeta,
} from "../src/index.js";

describe("index のエクスポート", () => {
  test("トランスフォーマーとエラーがエクスポートされている", ({ expect }) => {
    // 実行と検証
    expect(index.Brotli).toBe(Brotli);
    expect(index.BrotliInvalidLevelError).toBe(BrotliInvalidLevelError);
    expect(index.UnsupportedRuntimeError).toBe(UnsupportedRuntimeError);
    // 実装は展開失敗を専用エラーで包まないため、BrotliDecompressError は公開しない。
    expect("BrotliDecompressError" in index).toBe(false);
  });

  test("エラーの型が公開されている", ({ expect }) => {
    // 準備
    const args: BrotliInvalidLevelErrorArgs = { actual: 12 };
    const meta: BrotliInvalidLevelErrorMeta = { actual: 12 };
    const runtimeArgs: UnsupportedRuntimeErrorArgs = { name: "Brotli", runtime: "Node.js" };
    const runtimeMeta: UnsupportedRuntimeErrorMeta = { name: "Brotli", runtime: "Node.js" };

    // 実行と検証
    expect(args.actual).toBe(12);
    expect(meta.actual).toBe(12);
    expect(runtimeArgs.name).toBe("Brotli");
    expect(runtimeMeta.runtime).toBe("Node.js");
    expectTypeOf<BrotliInvalidLevelErrorArgs>().toHaveProperty("actual");
    expectTypeOf<BrotliInvalidLevelErrorMeta>().toEqualTypeOf<{ readonly actual: unknown }>();
  });

  test("存在しないエラーの型は公開されていない", () => {
    // @ts-expect-error BrotliDecompressError に対応する Args 型は存在しない。
    expectTypeOf<index.BrotliDecompressErrorArgs>().toBeNever();
  });
});
