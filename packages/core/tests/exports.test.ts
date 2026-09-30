import { expectTypeOf, test } from "vitest";

import * as errors from "../src/errors.js";
import * as core from "../src/index.js";
import * as storage from "../src/storage.types.js";
import * as transformer from "../src/transformer.types.js";

test("エントリーポイントは実行時の公開値をすべて再エクスポートする", ({ expect }) => {
  // 実行と検証
  expect(Object.keys(core).sort()).toStrictEqual([
    "ErrorBase",
    "InvalidUsageErrorBase",
    "setErrorMessage",
  ]);
});

test("エントリーポイントの実行時の値は errors モジュールと同一である", ({ expect }) => {
  // 実行と検証
  expect(core.ErrorBase).toBe(errors.ErrorBase);
  expect(core.InvalidUsageErrorBase).toBe(errors.InvalidUsageErrorBase);
  expect(core.setErrorMessage).toBe(errors.setErrorMessage);
});

test("storage と transformer のサブパスは実行時の値を公開しない", ({ expect }) => {
  // 実行と検証
  expect(Object.keys(storage)).toStrictEqual([]);
  expect(Object.keys(transformer)).toStrictEqual([]);
});

test("storage の型はエントリーポイントから同一に解決される", () => {
  // 実行と検証
  expectTypeOf<storage.IStorage>().toEqualTypeOf<core.IStorage>();
  expectTypeOf<storage.IWritableStream>().toEqualTypeOf<core.IWritableStream>();
  expectTypeOf<storage.IReadableStream>().toEqualTypeOf<core.IReadableStream>();
  expectTypeOf<storage.IWritableStreamStorage>().toEqualTypeOf<core.IWritableStreamStorage>();
  expectTypeOf<storage.IReadableStreamStorage>().toEqualTypeOf<core.IReadableStreamStorage>();
});

test("transformer の型はエントリーポイントから同一に解決される", () => {
  // 実行と検証
  expectTypeOf<transformer.ITransformer>().toEqualTypeOf<core.ITransformer>();
  expectTypeOf<transformer.IEncodable>().toEqualTypeOf<core.IEncodable>();
  expectTypeOf<transformer.IDecodable>().toEqualTypeOf<core.IDecodable>();
  expectTypeOf<transformer.IEncodableStreamTransformer>().toEqualTypeOf<core.IEncodableStreamTransformer>();
  expectTypeOf<transformer.IDecodableStreamTransformer>().toEqualTypeOf<core.IDecodableStreamTransformer>();
});

test("errors の型はエントリーポイントから同一に解決される", () => {
  // 実行と検証
  expectTypeOf<core.ErrorMeta>().toEqualTypeOf<errors.ErrorMeta>();
  expectTypeOf<core.ErrorOptions>().toEqualTypeOf<errors.ErrorOptions>();
});
