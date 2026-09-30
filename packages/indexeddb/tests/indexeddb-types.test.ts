import type { IStorage } from "@unikvs/core";
import { describe, expectTypeOf } from "vitest";

import IndexeddbStorage from "../src/indexeddb.js";
import { test } from "./_helpers.js";

describe("IStorage としての型契約", () => {
  test("IStorage を実装している", ({ expect, storage }) => {
    // 実行と検証
    expectTypeOf<IndexeddbStorage>().toMatchTypeOf<IStorage>();
    expect(storage.name).toBe("Indexeddb");
  });

  test("プロパティーの型が契約どおりである", ({ expect, storage }) => {
    // 実行と検証
    expectTypeOf(storage.name).toEqualTypeOf<string>();
    expectTypeOf(storage.isOpen).toEqualTypeOf<boolean>();
    expect(storage.isOpen).toBe(false);
  });

  test("ライフサイクルメソッドが Promise<void> を返す", () => {
    // 実行と検証
    expectTypeOf<IndexeddbStorage["open"]>().returns.toEqualTypeOf<Promise<void>>();
    expectTypeOf<IndexeddbStorage["close"]>().returns.toEqualTypeOf<Promise<void>>();
  });

  test("CRUD メソッドの戻り値の型が契約どおりである", ({ expect, storage }) => {
    // 実行と検証
    expectTypeOf<IndexeddbStorage["write"]>().returns.toEqualTypeOf<Promise<void>>();
    expectTypeOf<IndexeddbStorage["read"]>().returns.toEqualTypeOf<Promise<any>>();
    expectTypeOf<IndexeddbStorage["exists"]>().returns.toEqualTypeOf<Promise<boolean>>();
    expectTypeOf<IndexeddbStorage["delete"]>().returns.toEqualTypeOf<Promise<void>>();
    expectTypeOf<IndexeddbStorage["clear"]>().returns.toEqualTypeOf<Promise<void>>();
    expect(storage.name).toBe("Indexeddb");
  });

  test("ストリームメソッドが Uint8Array のストリームを返す", ({ expect, storage }) => {
    // 実行と検証
    expectTypeOf<IndexeddbStorage["getWritable"]>().returns.toEqualTypeOf<
      WritableStream<Uint8Array>
    >();
    expectTypeOf<IndexeddbStorage["getReadable"]>().returns.toEqualTypeOf<
      ReadableStream<Uint8Array>
    >();
    expect(storage.name).toBe("Indexeddb");
  });
});
