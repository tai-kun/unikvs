import { describe, expectTypeOf, test } from "vitest";

import {
  ZstdWasmDecompressError,
  ZstdWasmInitError,
  ZstdWasmInvalidLevelError,
} from "../src/errors.js";
import * as index from "../src/index.js";
import type { ZstdWasmInvalidLevelErrorArgs, ZstdWasmInvalidLevelErrorMeta } from "../src/index.js";
import ZstdWasm from "../src/zstd-wasm.js";

describe("index のエクスポート", () => {
  test("トランスフォーマーとエラーがエクスポートされている", ({ expect }) => {
    // 実行と検証
    expect(index.ZstdWasm).toBe(ZstdWasm);
    expect(index.ZstdWasmDecompressError).toBe(ZstdWasmDecompressError);
    expect(index.ZstdWasmInitError).toBe(ZstdWasmInitError);
    expect(index.ZstdWasmInvalidLevelError).toBe(ZstdWasmInvalidLevelError);
  });

  test("エラーの型が公開されている", ({ expect }) => {
    // 準備
    const args: ZstdWasmInvalidLevelErrorArgs = { actual: 0 };
    const meta: ZstdWasmInvalidLevelErrorMeta = { actual: 0 };

    // 実行と検証
    expect(args.actual).toBe(0);
    expect(meta.actual).toBe(0);
    expectTypeOf<ZstdWasmInvalidLevelErrorArgs>().toHaveProperty("actual");
    expectTypeOf<ZstdWasmInvalidLevelErrorMeta>().toEqualTypeOf<{ readonly actual: unknown }>();
  });

  test("存在しないエラーの型は公開されていない", () => {
    // @ts-expect-error ZstdWasmDecompressError に対応する Args 型は存在しない。
    expectTypeOf<index.ZstdWasmDecompressErrorArgs>().toBeNever();
    // @ts-expect-error ZstdWasmInitError に対応する Args 型は存在しない。
    expectTypeOf<index.ZstdWasmInitErrorArgs>().toBeNever();
  });
});
