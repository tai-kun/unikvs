import { describe, test as vitest } from "vitest";

import { KeyNotFoundError } from "../src/errors.js";
import Null from "../src/null.js";

/**
 * テストごとに空の Null インスタンスを提供します。
 * ストリーム経由の読み書きの振る舞いを検証するために使用します。
 */
const test = vitest.extend<{ storage: Null }>({
  // oxlint-disable-next-line no-empty-pattern
  async storage({}, use) {
    await use(new Null());
  },
});

describe("getWritable", () => {
  test("getWritable は関数として定義されている", ({ expect, storage }) => {
    // 実行と検証
    expect(typeof storage.getWritable).toBe("function");
  });

  test("返却値が getWriter・abort・close を備える", ({ expect, storage }) => {
    // 準備
    const writable = storage.getWritable({ key: "s1" });

    // 実行と検証
    expect(typeof writable.getWriter).toBe("function");
    expect(typeof writable.abort).toBe("function");
    expect(typeof writable.close).toBe("function");
  });

  test("書き込んで close しても例外を投げない", async ({ expect, storage }) => {
    // 準備
    const writer = storage.getWritable({ key: "s1" }).getWriter();

    // 実行
    await writer.write(new Uint8Array([1, 2]));
    await writer.write(new Uint8Array([3]));
    await writer.close();

    // 検証
    expect(storage.exists({ key: "s1" })).toBe(false);
  });

  test("書き込んだ後に read しても KeyNotFoundError を投げる", async ({ expect, storage }) => {
    // 準備
    const writer = storage.getWritable({ key: "s1" }).getWriter();
    await writer.write(new Uint8Array([1, 2]));
    await writer.close();

    // 実行と検証
    expect(() => storage.read({ key: "s1" })).toThrow(KeyNotFoundError);
  });

  test("書き込んだ後に exists しても false を返す", async ({ expect, storage }) => {
    // 準備
    const writer = storage.getWritable({ key: "s1" }).getWriter();
    await writer.write(new Uint8Array([1, 2]));
    await writer.close();

    // 実行と検証
    expect(storage.exists({ key: "s1" })).toBe(false);
  });

  test("任意のチャンクを書き込んでも例外を投げない", async ({ expect, storage }) => {
    // 準備
    const writer = storage.getWritable({ key: "s1" }).getWriter();

    // 実行
    await writer.write("text");
    await writer.write({ value: 1 });
    await writer.close();

    // 検証
    expect(storage.exists({ key: "s1" })).toBe(false);
  });

  test("中断済みの信号を渡しても、getWritable は成功する", ({ expect, storage }) => {
    // 準備
    const controller = new AbortController();
    controller.abort();
    const args = {
      key: "s1",
      vars: {},
      signal: controller.signal,
    };

    // 実行と検証
    expect(() => storage.getWritable(args)).not.toThrow();
  });
});

describe("getReadable", () => {
  test("getReadable は書き込みの有無にかかわらず KeyNotFoundError を投げる", ({
    expect,
    storage,
  }) => {
    // 準備
    storage.write({ key: "k1" });

    // 実行と検証
    expect(() => storage.getReadable({ key: "k1" })).toThrow(KeyNotFoundError);
    expect(() => storage.getReadable({ key: "unknown" })).toThrow(KeyNotFoundError);
  });

  test("getReadable が投げる KeyNotFoundError はキーを保持する", ({ expect, storage }) => {
    // 準備
    const key = "k1";
    let error: unknown;

    // 実行
    try {
      storage.getReadable({ key });
    } catch (ex) {
      error = ex;
    }

    // 検証
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect(error).toMatchObject({ meta: { key } });
  });

  test("中断済みの信号を渡しても、getReadable は KeyNotFoundError を投げる", ({
    expect,
    storage,
  }) => {
    // 準備
    const controller = new AbortController();
    controller.abort();
    const args = {
      key: "k1",
      vars: {},
      signal: controller.signal,
    };

    // 実行と検証
    expect(() => storage.getReadable(args)).toThrow(KeyNotFoundError);
  });
});
