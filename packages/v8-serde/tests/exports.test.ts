import { describe, expectTypeOf, test } from "vitest";

import { UnsupportedRuntimeError, V8SerdeDecodeError, V8SerdeEncodeError } from "../src/errors.js";
import type { UnsupportedRuntimeErrorArgs, UnsupportedRuntimeErrorMeta } from "../src/index.js";
import * as index from "../src/index.js";
import V8Serde from "../src/v8-serde.js";

describe("index のエクスポート", () => {
  test("トランスフォーマーがエクスポートされている", ({ expect }) => {
    // 実行と検証
    expect(index.V8Serde).toBe(V8Serde);
  });

  test("エラークラスがエクスポートされている", ({ expect }) => {
    // 実行と検証
    expect(index.V8SerdeEncodeError).toBe(V8SerdeEncodeError);
    expect(index.V8SerdeDecodeError).toBe(V8SerdeDecodeError);
    expect(index.UnsupportedRuntimeError).toBe(UnsupportedRuntimeError);
  });

  test("型がエクスポートされている", () => {
    // 実行と検証
    // `index.js` から型を import できることで、再輸出を確認する。
    expectTypeOf<UnsupportedRuntimeErrorArgs>().toBeObject();
    expectTypeOf<UnsupportedRuntimeErrorMeta>().toBeObject();
  });
});
