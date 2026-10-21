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
  });

  test("エラーの型が公開されている", () => {
    // 実行と検証
    expectTypeOf<BrotliWasmInvalidLevelErrorArgs>().toHaveProperty("actual");
    expectTypeOf<BrotliWasmInvalidLevelErrorMeta>().toEqualTypeOf<{ readonly actual: unknown }>();
  });
});
