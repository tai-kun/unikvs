// oxlint-disable import/no-namespace
import { test, describe, expectTypeOf } from "vite-plus/test";

import {
  ReadOnlySetNotAllowedError,
  ReadOnlyClearNotAllowedError,
  ReadOnlyDeleteNotAllowedError,
} from "../src/errors.js";
import type {
  ReadOnlySetNotAllowedErrorArgs,
  ReadOnlySetNotAllowedErrorMeta,
  ReadOnlyDeleteNotAllowedErrorArgs,
  ReadOnlyDeleteNotAllowedErrorMeta,
} from "../src/index.js";
import * as index from "../src/index.js";
import ReadOnly from "../src/readonly.js";

describe("index のエクスポート", () => {
  test("トランスフォーマーがエクスポートされている", ({ expect }) => {
    // 実行と検証：
    expect(index.ReadOnly).toBe(ReadOnly);
  });

  test("エラークラスがエクスポートされている", ({ expect }) => {
    // 実行と検証：
    expect(index.ReadOnlySetNotAllowedError).toBe(ReadOnlySetNotAllowedError);
    expect(index.ReadOnlyDeleteNotAllowedError).toBe(ReadOnlyDeleteNotAllowedError);
    expect(index.ReadOnlyClearNotAllowedError).toBe(ReadOnlyClearNotAllowedError);
  });

  test("型がエクスポートされている", () => {
    // 実行と検証：
    // `index.js` から型を import できることで型の再輸出を確認する。
    expectTypeOf<ReadOnlySetNotAllowedErrorMeta>().toEqualTypeOf<{ readonly key: string }>();
    expectTypeOf<ReadOnlySetNotAllowedErrorArgs>().toBeObject();
    expectTypeOf<ReadOnlyDeleteNotAllowedErrorMeta>().toEqualTypeOf<{ readonly key: string }>();
    expectTypeOf<ReadOnlyDeleteNotAllowedErrorArgs>().toBeObject();
  });
});
