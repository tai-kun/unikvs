import { describe, test as vitest } from "vitest";

import { KeyNotFoundError } from "../src/errors.js";
import WriteOnly from "../src/write-only.js";
import { RecordingStorage, StreamStorage } from "./_helpers.js";

/**
 * 各テストに新しい内部ストレージと、それをラップした WriteOnly を提供するフィクスチャーです。
 */
const test = vitest.extend<{
  inner: RecordingStorage;
  storage: WriteOnly;
}>({
  // oxlint-disable-next-line no-empty-pattern
  async inner({}, use) {
    await use(new RecordingStorage());
  },
  async storage({ inner }, use) {
    await use(new WriteOnly(inner));
  },
});

describe("読み出しの拒否", () => {
  test("read は英名・英語メッセージ・キーを保持した KeyNotFoundError を投げる", async ({
    expect,
    inner,
    storage,
  }) => {
    // 準備
    const key = "k1";
    inner.map.set(key, "v1");
    let error: unknown;

    // 実行
    try {
      storage.read({ key });
    } catch (ex) {
      error = ex;
    }

    // 検証
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect(error).toMatchObject({
      name: "WriteOnlyKeyNotFoundError",
      message: `Key not found: ${key}`,
      meta: { key },
    });
  });

  test("getReadable は英名・英語メッセージ・キーを保持した KeyNotFoundError を投げる", async ({
    expect,
    inner,
    storage,
  }) => {
    // 準備
    const key = "k1";
    inner.map.set(key, "v1");
    let error: unknown;

    // 実行
    try {
      storage.getReadable({ key });
    } catch (ex) {
      error = ex;
    }

    // 検証
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect(error).toMatchObject({
      name: "WriteOnlyKeyNotFoundError",
      message: `Key not found: ${key}`,
      meta: { key },
    });
  });

  test("保存済みのキーでも read は内部ストレージを参照しない", async ({
    expect,
    inner,
    storage,
  }) => {
    // 準備
    const key = "k1";
    await storage.write({ key, data: "v1", vars: {}, signal: new AbortController().signal });

    // 実行と検証
    expect(() => storage.read({ key })).toThrow(KeyNotFoundError);
    expect(inner.readCount).toBe(0);
  });

  test("getReadable は内部ストレージの getReadable を呼び出さない", ({ expect }) => {
    // 準備
    const inner = new StreamStorage();
    const storage = new WriteOnly(inner);
    inner.map.set("k1", new Uint8Array([1, 2, 3]));

    // 実行と検証
    expect(() => storage.getReadable({ key: "k1" })).toThrow(KeyNotFoundError);
    expect(inner.getReadableCount).toBe(0);
  });
});

describe("存在確認の拒否", () => {
  test("exists は保存済み・未保存・空文字キーのいずれでも false を返す", async ({
    expect,
    inner,
    storage,
  }) => {
    // 準備
    await storage.write({
      key: "saved",
      data: "v1",
      vars: {},
      signal: new AbortController().signal,
    });
    await storage.write({ key: "", data: "v2", vars: {}, signal: new AbortController().signal });

    // 実行と検証
    expect(inner.map.has("saved")).toBe(true);
    expect(storage.exists({ key: "saved" })).toBe(false);
    expect(storage.exists({ key: "missing" })).toBe(false);
    expect(storage.exists({ key: "" })).toBe(false);
  });

  test("exists は内部ストレージへ問い合わせない", async ({ expect, inner, storage }) => {
    // 準備
    const key = "k1";
    inner.map.set(key, "v1");

    // 実行
    const result = storage.exists({ key });

    // 検証
    expect(result).toBe(false);
    expect(inner.existsCount).toBe(0);
  });
});
