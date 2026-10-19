import { describe, expectTypeOf, test } from "vitest";

import BrotliWasm from "../src/brotli-wasm.js";
import { BrotliWasmInitError, BrotliWasmInvalidLevelError } from "../src/errors.js";
import * as index from "../src/index.js";
import type {
  BrotliWasmInvalidLevelErrorArgs,
  BrotliWasmInvalidLevelErrorMeta,
} from "../src/index.js";

describe("index のエクスポート", () => {
  test("トランスフォーマーとエラーがエクスポートされている", ({ expect }) => {
    // 実行と検証
    expect(index.BrotliWasm).toBe(BrotliWasm);
    expect(index.BrotliWasmInitError).toBe(BrotliWasmInitError);
    expect(index.BrotliWasmInvalidLevelError).toBe(BrotliWasmInvalidLevelError);
    // 実装は展開失敗を専用エラーで包まないため、BrotliWasmDecompressError は公開しない。
    expect("BrotliWasmDecompressError" in index).toBe(false);
    // 実装はストリーミング API を提供しないため、encodeStream/decodeStream は持たない。
    expect("encodeStream" in BrotliWasm.prototype).toBe(false);
    expect("decodeStream" in BrotliWasm.prototype).toBe(false);
  });

  test("エラーの型が公開されている", ({ expect }) => {
    // 準備
    const args: BrotliWasmInvalidLevelErrorArgs = { actual: 12 };
    const meta: BrotliWasmInvalidLevelErrorMeta = { actual: 12 };

    // 実行と検証
    expect(args.actual).toBe(12);
    expect(meta.actual).toBe(12);
    expectTypeOf<BrotliWasmInvalidLevelErrorArgs>().toHaveProperty("actual");
    expectTypeOf<BrotliWasmInvalidLevelErrorMeta>().toEqualTypeOf<{ readonly actual: unknown }>();
  });

  test("存在しないエラーの型は公開されていない", () => {
    // @ts-expect-error BrotliWasmDecompressError に対応する Args 型は存在しない。
    expectTypeOf<index.BrotliWasmDecompressErrorArgs>().toBeNever();
  });
});
