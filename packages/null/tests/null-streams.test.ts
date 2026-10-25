import type { IStorage } from "@unikvs/core";
import {
  createGetContext,
  createHasContext,
  createSetContext,
  createStreamContext,
} from "@unikvs/testing";
import { test as vitest, describe } from "vite-plus/test";

import { KeyNotFoundError } from "../src/errors.js";
import Null from "../src/null.js";

/**
 * テストごとに空の Null インスタンスを提供します。
 * ストリーム経由の読み書きの振る舞いを検証するために使用します。
 */
const test = vitest.extend<{ storage: Null }>({
  async storage({}, use) {
    await use(new Null());
  },
});
describe("getWritable", () => {
  test("getWritable は関数として定義されている", ({ expect, storage }) => {
    // 実行と検証：
    expect(typeof storage.getWritable).toBe("function");
  });

  test("返却値が getWriter・abort・close を備える", ({ expect, storage }) => {
    // 準備：
    const writable = storage.getWritable(createSetContext("s1") as IStorage.GetWritableContext);

    // 実行と検証：
    expect(typeof writable.getWriter).toBe("function");
    expect(typeof writable.abort).toBe("function");
    expect(typeof writable.close).toBe("function");
  });

  test("書き込んで close しても例外を投げない", async ({ expect, storage }) => {
    // 準備：
    const writer = storage
      .getWritable(createSetContext("s1") as IStorage.GetWritableContext)
      .getWriter();

    // 実行：
    await writer.write(new Uint8Array([1, 2]));
    await writer.write(new Uint8Array([3]));
    await writer.close();

    // 検証：
    expect(storage.exists(createHasContext("s1") as IStorage.ExistsContext)).toBe(false);
  });

  test("書き込んだ後に read しても KeyNotFoundError を投げる", async ({ expect, storage }) => {
    // 準備：
    const writer = storage
      .getWritable(createSetContext("s1") as IStorage.GetWritableContext)
      .getWriter();
    await writer.write(new Uint8Array([1, 2]));
    await writer.close();

    // 実行と検証：
    expect(() => storage.read(createGetContext("s1") as IStorage.ReadContext)).toThrow(
      KeyNotFoundError,
    );
  });

  test("書き込んだ後に exists しても false を返す", async ({ expect, storage }) => {
    // 準備：
    const writer = storage
      .getWritable(createSetContext("s1") as IStorage.GetWritableContext)
      .getWriter();
    await writer.write(new Uint8Array([1, 2]));
    await writer.close();

    // 実行と検証：
    expect(storage.exists(createHasContext("s1") as IStorage.ExistsContext)).toBe(false);
  });

  test("任意のチャンクを書き込んでも例外を投げない", async ({ expect, storage }) => {
    // 準備：
    const writer = storage
      .getWritable(createSetContext("s1") as IStorage.GetWritableContext)
      .getWriter();

    // 実行：
    await writer.write("text");
    await writer.write({ value: 1 });
    await writer.close();

    // 検証：
    expect(storage.exists(createHasContext("s1") as IStorage.ExistsContext)).toBe(false);
  });

  test("中断済みの信号を渡しても、getWritable は成功する", ({ expect, storage }) => {
    // 準備：
    const controller = new AbortController();
    controller.abort();

    const c = createSetContext("s1", { signal: controller.signal }) as IStorage.GetWritableContext;
    c.set("extra", "value");

    // 実行と検証：
    expect(() => storage.getWritable(c)).not.toThrow();
  });
});
describe("getReadable", () => {
  test("getReadable は書き込みの有無にかかわらず KeyNotFoundError を投げる", ({
    expect,
    storage,
  }) => {
    // 準備：
    storage.write(createSetContext("k1") as IStorage.WriteContext, undefined);

    // 実行と検証：
    expect(() =>
      storage.getReadable(createStreamContext("k1") as IStorage.GetReadableContext),
    ).toThrow(KeyNotFoundError);
    expect(() =>
      storage.getReadable(createStreamContext("unknown") as IStorage.GetReadableContext),
    ).toThrow(KeyNotFoundError);
  });

  test("getReadable が投げる KeyNotFoundError はキーを保持する", ({ expect, storage }) => {
    // 準備：
    const key = "k1";
    let error: unknown;

    // 実行：
    try {
      storage.getReadable(createStreamContext(key) as IStorage.GetReadableContext);
    } catch (ex) {
      error = ex;
    }

    // 検証：
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect(error).toMatchObject({ meta: { key } });
  });

  test("中断済みの信号を渡しても、getReadable は KeyNotFoundError を投げる", ({
    expect,
    storage,
  }) => {
    // 準備：
    const controller = new AbortController();
    controller.abort();

    // 実行と検証：
    expect(() =>
      storage.getReadable(
        createStreamContext("k1", { signal: controller.signal }) as IStorage.GetReadableContext,
      ),
    ).toThrow(KeyNotFoundError);
  });
});
