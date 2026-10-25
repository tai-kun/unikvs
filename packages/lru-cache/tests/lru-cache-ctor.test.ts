import { captureThrown } from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

import { InvalidMaxBytesError, InvalidMaxEntriesError } from "../src/errors.js";
import LruCache from "../src/lru-cache.js";

describe("コンストラクターの検証", () => {
  test("引数なしでは上限なしで動作する", ({ expect }) => {
    // 実行：
    const storage = new LruCache();

    // 検証：
    expect(storage.maxEntries).toBe(undefined);
    expect(storage.maxBytes).toBe(undefined);
    expect(storage.size).toBe(0);
    expect(storage.bytes).toBe(0);
  });

  test("maxEntries と maxBytes を読み出せる", ({ expect }) => {
    // 実行：
    const storage = new LruCache({
      maxBytes: 10,
      maxEntries: 2,
    });

    // 検証：
    expect(storage.maxEntries).toBe(2);
    expect(storage.maxBytes).toBe(10);
  });

  test("maxEntries に 0 を指定しても受理される", ({ expect }) => {
    // 実行と検証：
    expect(() => new LruCache({ maxEntries: 0 })).not.toThrow();
    expect(new LruCache({ maxEntries: 0 }).maxEntries).toBe(0);
  });

  test("maxEntries に -0 を指定したとき、+0 として正規化される", ({ expect }) => {
    // 実行：
    const storage = new LruCache({ maxEntries: -0 });

    // 検証：
    expect(Object.is(storage.maxEntries, -0)).toBe(false);
    expect(storage.maxEntries).toBe(0);
  });

  test("maxBytes に -0 を指定したとき、+0 として正規化される", ({ expect }) => {
    // 実行：
    const storage = new LruCache({ maxBytes: -0 });

    // 検証：
    expect(Object.is(storage.maxBytes, -0)).toBe(false);
    expect(storage.maxBytes).toBe(0);
  });

  test("整数でない maxEntries は InvalidMaxEntriesError を投げる", ({ expect }) => {
    // 実行：
    const error = captureThrown(() => new LruCache({ maxEntries: 1.5 }));

    // 検証：
    expect(error).toBeInstanceOf(InvalidMaxEntriesError);
    expect((error as InvalidMaxEntriesError).meta).toStrictEqual({ actual: 1.5 });
  });

  test("負の maxEntries は InvalidMaxEntriesError を投げる", ({ expect }) => {
    // 実行：
    const error = captureThrown(() => new LruCache({ maxEntries: -1 }));

    // 検証：
    expect(error).toBeInstanceOf(InvalidMaxEntriesError);
    expect((error as InvalidMaxEntriesError).meta).toStrictEqual({ actual: -1 });
  });

  test("数値でない maxEntries は InvalidMaxEntriesError を投げる", ({ expect }) => {
    // 実行：
    const error = captureThrown(() => new LruCache({ maxEntries: "2" as unknown as number }));

    // 検証：
    expect(error).toBeInstanceOf(InvalidMaxEntriesError);
  });

  test("NaN の maxEntries は InvalidMaxEntriesError を投げる", ({ expect }) => {
    // 実行：
    const error = captureThrown(() => new LruCache({ maxEntries: Number.NaN }));

    // 検証：
    expect(error).toBeInstanceOf(InvalidMaxEntriesError);
  });

  test("無限大の maxEntries は InvalidMaxEntriesError を投げる", ({ expect }) => {
    // 実行：
    const error = captureThrown(() => new LruCache({ maxEntries: Number.POSITIVE_INFINITY }));

    // 検証：
    expect(error).toBeInstanceOf(InvalidMaxEntriesError);
    expect((error as InvalidMaxEntriesError).meta).toStrictEqual({
      actual: Number.POSITIVE_INFINITY,
    });
  });

  test("数値でない maxBytes は InvalidMaxBytesError を投げる", ({ expect }) => {
    // 実行：
    const error = captureThrown(() => new LruCache({ maxBytes: "10" as unknown as number }));

    // 検証：
    expect(error).toBeInstanceOf(InvalidMaxBytesError);
    expect((error as InvalidMaxBytesError).meta).toStrictEqual({ actual: "10" });
  });

  test("NaN の maxBytes は InvalidMaxBytesError を投げる", ({ expect }) => {
    // 実行：
    const error = captureThrown(() => new LruCache({ maxBytes: Number.NaN }));

    // 検証：
    expect(error).toBeInstanceOf(InvalidMaxBytesError);
  });

  test("無限大の maxBytes は InvalidMaxBytesError を投げる", ({ expect }) => {
    // 実行：
    const error = captureThrown(() => new LruCache({ maxBytes: Number.POSITIVE_INFINITY }));

    // 検証：
    expect(error).toBeInstanceOf(InvalidMaxBytesError);
  });

  test("負の maxBytes は InvalidMaxBytesError を投げる", ({ expect }) => {
    // 実行：
    const error = captureThrown(() => new LruCache({ maxBytes: -1 }));

    // 検証：
    expect(error).toBeInstanceOf(InvalidMaxBytesError);
    expect((error as InvalidMaxBytesError).meta).toStrictEqual({ actual: -1 });
  });
});
