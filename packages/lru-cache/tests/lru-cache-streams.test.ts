import { captureRejection } from "@unikvs/testing";
import { describe, test as vitest } from "vitest";

import { InvalidChunkTypeError, KeyNotFoundError } from "../src/errors.js";
import LruCache from "../src/lru-cache.js";

/**
 * テストごとに open 済みの LruCache インスタンスを提供します。
 * ストリーム経由の読み書きの振る舞いを検証するために使用します。
 */
const test = vitest.extend<{ storage: LruCache }>({
  // oxlint-disable-next-line no-empty-pattern
  async storage({}, use) {
    const storage = new LruCache();
    await storage.open({ signal: new AbortController().signal });
    await use(storage);
  },
});

describe("getWritable", () => {
  test("長さの異なる複数のチャンクを順番どおり結合して保存する", async ({ expect, storage }) => {
    // 準備
    const key = "s1";
    const writer = storage.getWritable({ vars: {}, key }).getWriter();

    // 実行
    await writer.write(new Uint8Array([1, 2, 3]));
    await writer.write(new Uint8Array([4]));
    await writer.write(new Uint8Array([5, 6]));
    await writer.close();

    // 検証
    expect(storage.read({ key })).toStrictEqual(new Uint8Array([1, 2, 3, 4, 5, 6]));
  });

  test("close するまで値は保存されない", async ({ expect, storage }) => {
    // 準備
    const key = "s1";
    const writer = storage.getWritable({ vars: {}, key }).getWriter();

    // 実行
    await writer.write(new Uint8Array([1]));
    const existsBeforeClose = storage.exists({ key });
    await writer.close();

    // 検証
    expect(existsBeforeClose).toBe(false);
    expect(storage.exists({ key })).toBe(true);
  });

  test("上書き時も close までは旧値が見える", async ({ expect, storage }) => {
    // 準備
    const key = "s1";
    storage.write({ vars: {}, key, data: new Uint8Array([9]) });
    const writer = storage.getWritable({ vars: {}, key }).getWriter();

    // 実行
    await writer.write(new Uint8Array([1, 2]));
    const visibleBeforeClose = storage.read({ key });
    await writer.close();

    // 検証
    expect(visibleBeforeClose).toStrictEqual(new Uint8Array([9]));
    expect(storage.read({ key })).toStrictEqual(new Uint8Array([1, 2]));
  });

  test("空のストリームを close したとき、長さ 0 の値が保存される", async ({ expect, storage }) => {
    // 準備
    const key = "s1";
    const writer = storage.getWritable({ vars: {}, key }).getWriter();

    // 実行
    await writer.close();

    // 検証
    expect(storage.exists({ key })).toBe(true);
    expect(storage.read({ key })).toStrictEqual(new Uint8Array(0));
  });

  test("abort したとき値は保存されない", async ({ expect, storage }) => {
    // 準備
    const key = "s1";
    const writer = storage.getWritable({ vars: {}, key }).getWriter();

    // 実行
    await writer.write(new Uint8Array([1, 2]));
    await writer.abort();

    // 検証
    expect(storage.exists({ key })).toBe(false);
    await expect(writer.closed).rejects.toBeUndefined();
  });

  test("Uint8Array 以外のチャンクを書き込むと InvalidChunkTypeError で拒否される", async ({
    expect,
    storage,
  }) => {
    // 準備
    const key = "s1";
    const writer = storage.getWritable({ vars: {}, key }).getWriter();

    // 実行
    const error = await captureRejection(
      writer.write("invalid" as unknown as Uint8Array<ArrayBuffer>),
    );

    // 検証
    expect(error).toBeInstanceOf(InvalidChunkTypeError);
    expect(storage.exists({ key })).toBe(false);
  });

  test("ストリームの close で保存したとき、最も新しいものとして扱われる", async ({
    expect,
    signal,
  }) => {
    // 準備
    const storage = new LruCache({ maxEntries: 2 });
    await storage.open({ signal });
    storage.write({ vars: {}, key: "k1", data: new Uint8Array([1]) });
    storage.write({ vars: {}, key: "k2", data: new Uint8Array([2]) });
    const writer = storage.getWritable({ vars: {}, key: "k1" }).getWriter();

    // 実行
    await writer.write(new Uint8Array([9]));
    await writer.close();
    storage.write({ vars: {}, key: "k3", data: new Uint8Array([3]) });

    // 検証
    expect(storage.exists({ key: "k2" })).toBe(false);
    expect(storage.read({ key: "k1" })).toStrictEqual(new Uint8Array([9]));
  });
});

describe("getReadable", () => {
  test("存在しないキーでは KeyNotFoundError を投げる", ({ expect, storage }) => {
    // 実行と検証
    expect(() => storage.getReadable({ key: "unknown" })).toThrow(KeyNotFoundError);
  });

  test("保存値を単一チャンクとして送出する", async ({ expect, storage }) => {
    // 準備
    const key = "s1";
    const data = new Uint8Array([1, 2, 3]);
    storage.write({ vars: {}, key, data });

    // 実行
    const reader = storage.getReadable({ key }).getReader();
    const first = await reader.read();
    const second = await reader.read();

    // 検証
    expect(first.done).toBe(false);
    expect(first.value).toStrictEqual(data);
    expect(second.done).toBe(true);
    expect(second.value).toBe(undefined);
  });

  test("取得時に直近使用順を更新する", async ({ expect, signal }) => {
    // 準備
    const storage = new LruCache({ maxEntries: 2 });
    await storage.open({ signal });
    storage.write({ vars: {}, key: "k1", data: new Uint8Array([1]) });
    storage.write({ vars: {}, key: "k2", data: new Uint8Array([2]) });
    const reader = storage.getReadable({ key: "k1" }).getReader();
    await reader.read();
    reader.releaseLock();

    // 実行
    storage.write({ vars: {}, key: "k3", data: new Uint8Array([3]) });

    // 検証
    expect(storage.exists({ key: "k2" })).toBe(false);
    expect(storage.read({ key: "k1" })).toStrictEqual(new Uint8Array([1]));
  });

  test("読み取り中に同じキーを書き換えても進行中のストリームは元の値を送出する", async ({
    expect,
    storage,
  }) => {
    // 準備
    const key = "s1";
    storage.write({ vars: {}, key, data: new Uint8Array([1, 2]) });
    const reader = storage.getReadable({ key }).getReader();

    // 実行
    storage.write({ vars: {}, key, data: new Uint8Array([3, 4]) });
    const { value } = await reader.read();

    // 検証
    expect(value).toStrictEqual(new Uint8Array([1, 2]));
  });

  test("reader.cancel しても保存値は変わらない", async ({ expect, storage }) => {
    // 準備
    const key = "s1";
    const data = new Uint8Array([1, 2, 3]);
    storage.write({ vars: {}, key, data });
    const reader = storage.getReadable({ key }).getReader();

    // 実行
    await reader.cancel();

    // 検証
    expect(storage.read({ key })).toStrictEqual(data);
  });
});
