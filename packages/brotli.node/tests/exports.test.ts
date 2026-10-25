import { test, describe, expectTypeOf } from "vite-plus/test";

// oxlint-disable import/no-namespace
import Brotli from "../src/brotli.js";
import { BrotliInvalidLevelError, UnsupportedRuntimeError } from "../src/errors.js";
import * as index from "../src/index.js";
import type {
  BrotliInvalidLevelErrorArgs,
  BrotliInvalidLevelErrorMeta,
  UnsupportedRuntimeErrorArgs,
  UnsupportedRuntimeErrorMeta,
} from "../src/index.js";

describe("index のエクスポート", () => {
  test("トランスフォーマーとエラーがエクスポートされている", ({ expect }) => {
    // 実行と検証：
    expect(index.Brotli).toBe(Brotli);
    expect(index.BrotliInvalidLevelError).toBe(BrotliInvalidLevelError);
    expect(index.UnsupportedRuntimeError).toBe(UnsupportedRuntimeError);
  });

  test("エラーの型が公開されている", () => {
    // 実行と検証：
    expectTypeOf<BrotliInvalidLevelErrorArgs>().toHaveProperty("actual");
    expectTypeOf<BrotliInvalidLevelErrorMeta>().toEqualTypeOf<{ readonly actual: unknown }>();
    expectTypeOf<UnsupportedRuntimeErrorArgs>().toHaveProperty("runtime");
    expectTypeOf<UnsupportedRuntimeErrorMeta>().toEqualTypeOf<{
      readonly name: string;
      readonly runtime: string;
    }>();
  });
});
