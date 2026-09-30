import type { IStorage } from "@unikvs/core";
import { describe, expectTypeOf, test as vitest } from "vitest";

import { KeyNotFoundError } from "../src/errors.js";
import WriteOnly from "../src/write-only.js";
import { RecordingStorage } from "./_helpers.js";

/**
 * 各テストに新しい内部ストレージと、それをラップした WriteOnly を提供するフィクスチャーです。
 */
const test = vitest.extend<{
  storage: WriteOnly;
}>({
  // oxlint-disable-next-line no-empty-pattern
  async storage({}, use) {
    await use(new WriteOnly(new RecordingStorage()));
  },
});

describe("WriteOnly の型契約", () => {
  test("IStorage を実装している", ({ storage }) => {
    expectTypeOf(storage).toExtend<IStorage>();
  });

  test("コンストラクターは内部ストレージと省略可能なオプションを受け取る", () => {
    expectTypeOf(WriteOnly).toBeConstructibleWith(new RecordingStorage());
    expectTypeOf(WriteOnly).toBeConstructibleWith(new RecordingStorage(), { allowDelete: true });
  });

  test("read と getReadable の戻り値は never である", ({ storage }) => {
    expectTypeOf<typeof storage.read>().returns.toBeNever();
    expectTypeOf<typeof storage.getReadable>().returns.toBeNever();
  });

  test("exists の戻り値は false リテラルである", ({ storage }) => {
    expectTypeOf<typeof storage.exists>().returns.toEqualTypeOf<false>();
  });

  test("name は string、allowDelete は boolean である", ({ storage }) => {
    expectTypeOf(storage.name).toEqualTypeOf<string>();
    expectTypeOf(storage.allowDelete).toEqualTypeOf<boolean>();
  });

  test("getWritable は内部ストレージと同じ関数型か undefined である", ({ storage }) => {
    expectTypeOf(storage.getWritable).toEqualTypeOf<
      NonNullable<IStorage["getWritable"]> | undefined
    >();
  });

  test("KeyNotFoundError は Error を継承し key を meta に持つ", () => {
    // 準備
    const error = new KeyNotFoundError({ key: "k1" });

    // 実行と検証
    expectTypeOf(error).toExtend<Error>();
    expectTypeOf(error.meta.key).toEqualTypeOf<string>();
  });
});
