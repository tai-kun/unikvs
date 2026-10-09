import { describe, test } from "vitest";

import { KeyNotFoundError } from "../src/errors.js";
import Http, { type IFetch } from "../src/http.js";
import { abortedSignal, captureRejection, createMockServer } from "./_helpers.js";

/**
 * 毎回新しい疑似サーバーと Http を組み立てます。
 * バイナリー往復の検証に使用します。
 */
function setup(): { storage: Http; store: Map<string, Uint8Array> } {
  const { fetch, store } = createMockServer();
  const storage = new Http("https://kv.example.com/store", { fetch });

  return { storage, store };
}

describe("バイナリーの往復", () => {
  test("全 256 バイト値を保存したとき、byte-for-byte で一致する", async ({ expect }) => {
    // 準備
    const { storage } = setup();
    const data = new Uint8Array(256);

    for (let i = 0; i < 256; i += 1) {
      data[i] = i;
    }

    // 実行
    await storage.write({ key: "all", data, signal: AbortSignal.timeout(5_000), vars: {} });
    const result = await storage.read({ key: "all", signal: AbortSignal.timeout(5_000), vars: {} });

    // 検証
    expect(result).toStrictEqual(data);
  });

  test("0x00 と 0xff を含む値を保存したとき、そのまま取得できる", async ({ expect }) => {
    // 準備
    const { storage } = setup();
    const data = new Uint8Array([0x00, 0xff, 0x00, 0xff]);

    // 実行
    await storage.write({ key: "edge", data, signal: AbortSignal.timeout(5_000), vars: {} });
    const result = await storage.read({
      key: "edge",
      signal: AbortSignal.timeout(5_000),
      vars: {},
    });

    // 検証
    expect(result).toStrictEqual(data);
  });

  test("1MiB の値を保存したとき、整合性を保ったまま取得できる", async ({ expect }) => {
    // 準備
    const { storage } = setup();
    const data = new Uint8Array(1_048_576).fill(7);

    // 実行
    await storage.write({ key: "big", data, signal: AbortSignal.timeout(5_000), vars: {} });
    const result = await storage.read({ key: "big", signal: AbortSignal.timeout(5_000), vars: {} });

    // 検証
    expect(result).toStrictEqual(data);
  });

  test("0 バイトの値を保存したとき、exists は true を返す", async ({ expect }) => {
    // 準備
    const { storage } = setup();

    // 実行
    await storage.write({
      key: "empty",
      data: new Uint8Array(0),
      signal: AbortSignal.timeout(5_000),
      vars: {},
    });

    // 検証
    expect(
      await storage.exists({ key: "empty", signal: AbortSignal.timeout(5_000), vars: {} }),
    ).toBe(true);
    expect(
      await storage.read({ key: "empty", signal: AbortSignal.timeout(5_000), vars: {} }),
    ).toStrictEqual(new Uint8Array(0));
  });

  test("既存のキーに書き込んだとき、長さが変わっても値が更新される", async ({ expect }) => {
    // 準備
    const { storage } = setup();
    await storage.write({
      key: "k1",
      data: new Uint8Array([1, 2, 3, 4]),
      signal: AbortSignal.timeout(5_000),
      vars: {},
    });

    // 実行
    await storage.write({
      key: "k1",
      data: new Uint8Array([9]),
      signal: AbortSignal.timeout(5_000),
      vars: {},
    });

    // 検証
    expect(
      await storage.read({ key: "k1", signal: AbortSignal.timeout(5_000), vars: {} }),
    ).toStrictEqual(new Uint8Array([9]));
  });
});

describe("削除の冪等性", () => {
  test("存在しないキーを削除しても成功する", async ({ expect }) => {
    // 準備
    const { storage } = setup();

    // 実行と検証
    await storage.delete({ key: "none", signal: AbortSignal.timeout(5_000), vars: {} });
    expect(
      await storage.exists({ key: "none", signal: AbortSignal.timeout(5_000), vars: {} }),
    ).toBe(false);
  });

  test("削除済みのキーを再度削除しても成功する", async ({ expect }) => {
    // 準備
    const { storage } = setup();
    await storage.write({
      key: "k1",
      data: new Uint8Array([1]),
      signal: AbortSignal.timeout(5_000),
      vars: {},
    });
    await storage.delete({ key: "k1", signal: AbortSignal.timeout(5_000), vars: {} });

    // 実行と検証
    await storage.delete({ key: "k1", signal: AbortSignal.timeout(5_000), vars: {} });
    expect(await storage.exists({ key: "k1", signal: AbortSignal.timeout(5_000), vars: {} })).toBe(
      false,
    );
  });

  test("410 応答のキーを削除しても成功する", async ({ expect }) => {
    // 準備
    const goneFetch: IFetch = async () => new Response(null, { status: 410, statusText: "Gone" });
    const storage = new Http("https://kv.example.com/store", { fetch: goneFetch });

    // 実行と検証
    await expect(
      storage.delete({ key: "gone", signal: AbortSignal.timeout(5_000), vars: {} }),
    ).resolves.toBeUndefined();
  });
});

describe("欠番の読み取り", () => {
  test("存在しないキーの read は KeyNotFoundError を投げる", async ({ expect }) => {
    // 準備
    const { storage } = setup();

    // 実行
    const error = await captureRejection(
      storage.read({ key: "unknown", signal: AbortSignal.timeout(5_000), vars: {} }),
    );

    // 検証
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect((error as KeyNotFoundError).meta).toStrictEqual({ key: "unknown" });
  });

  test("410 応答のキーの read は KeyNotFoundError を投げる", async ({ expect }) => {
    // 準備
    const goneFetch: IFetch = async () => new Response(null, { status: 410, statusText: "Gone" });
    const storage = new Http("https://kv.example.com/store", { fetch: goneFetch });

    // 実行
    const error = await captureRejection(
      storage.read({ key: "gone", signal: AbortSignal.timeout(5_000), vars: {} }),
    );

    // 検証
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect((error as KeyNotFoundError).meta).toStrictEqual({ key: "gone" });
  });

  test("中断済みシグナルでの read は中断例外を投げる", async ({ expect }) => {
    // 準備
    const { storage } = setup();

    // 実行
    const error = await captureRejection(
      storage.read({ key: "k1", signal: abortedSignal(), vars: {} }),
    );

    // 検証
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("AbortError");
  });
});
