import type { IStorage } from "@unikvs/core";
import {
  abortedSignal,
  captureRejection,
  createGetContext,
  createHasContext,
  createSetContext,
  createDeleteContext,
} from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

// oxlint-disable unicorn/number-literal-case
import { KeyNotFoundError } from "../src/errors.js";
import Http, { type IFetch } from "../src/http.js";
import { createMockServer } from "./_helpers.js";

/**
 * 毎回新しい疑似サーバーと Http を組み立てます。
 * バイナリー往復の検証に使用します。
 */
function setup(): {
  store: Map<string, Uint8Array>;
  storage: Http;
} {
  const { fetch, store } = createMockServer();
  const storage = new Http("https://kv.example.com/store", { fetch });

  return {
    store,
    storage,
  };
}

describe("バイナリーの往復", () => {
  test("全 256 バイト値を保存したとき、byte-for-byte で一致する", async ({ expect }) => {
    // 準備：
    const { storage } = setup();
    const data = new Uint8Array(256);

    for (let i = 0; i < 256; i += 1) {
      data[i] = i;
    }

    // 実行：
    await storage.write(
      createSetContext("all", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      data,
    );
    const result = await storage.read(
      createGetContext("all", { signal: AbortSignal.timeout(5000) }) as IStorage.ReadContext,
    );

    // 検証：
    expect(result).toStrictEqual(data);
  });

  test("0x00 と 0xff を含む値を保存したとき、そのまま取得できる", async ({ expect }) => {
    // 準備：
    const { storage } = setup();
    const data = new Uint8Array([0x00, 0xff, 0x00, 0xff]);

    // 実行：
    await storage.write(
      createSetContext("edge", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      data,
    );

    const result = await storage.read(
      createGetContext("edge", { signal: AbortSignal.timeout(5000) }) as IStorage.ReadContext,
    );

    // 検証：
    expect(result).toStrictEqual(data);
  });

  test("1MiB の値を保存したとき、整合性を保ったまま取得できる", async ({ expect }) => {
    // 準備：
    const { storage } = setup();
    const data = new Uint8Array(1_048_576).fill(7);

    // 実行：
    await storage.write(
      createSetContext("big", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      data,
    );

    const result = await storage.read(
      createGetContext("big", { signal: AbortSignal.timeout(5000) }) as IStorage.ReadContext,
    );

    // 検証：
    expect(result).toStrictEqual(data);
  });

  test("0 バイトの値を保存したとき、exists は true を返す", async ({ expect }) => {
    // 準備：
    const { storage } = setup();

    // 実行：
    await storage.write(
      createSetContext("empty", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      new Uint8Array(0),
    );

    // 検証：
    expect(
      await storage.exists(
        createHasContext("empty", { signal: AbortSignal.timeout(5000) }) as IStorage.ExistsContext,
      ),
    ).toBe(true);
    expect(
      await storage.read(
        createGetContext("empty", { signal: AbortSignal.timeout(5000) }) as IStorage.ReadContext,
      ),
    ).toStrictEqual(new Uint8Array(0));
  });

  test("既存のキーに書き込んだとき、長さが変わっても値が更新される", async ({ expect }) => {
    // 準備：
    const { storage } = setup();
    await storage.write(
      createSetContext("k1", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      new Uint8Array([1, 2, 3, 4]),
    );

    // 実行：
    await storage.write(
      createSetContext("k1", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      new Uint8Array([9]),
    );

    // 検証：
    expect(
      await storage.read(
        createGetContext("k1", { signal: AbortSignal.timeout(5000) }) as IStorage.ReadContext,
      ),
    ).toStrictEqual(new Uint8Array([9]));
  });
});

describe("削除の冪等性", () => {
  test("存在しないキーを削除しても成功する", async ({ expect }) => {
    // 準備：
    const { storage } = setup();

    // 実行と検証：
    await storage.delete(
      createDeleteContext("none", { signal: AbortSignal.timeout(5000) }) as IStorage.DeleteContext,
    );
    expect(
      await storage.exists(
        createHasContext("none", { signal: AbortSignal.timeout(5000) }) as IStorage.ExistsContext,
      ),
    ).toBe(false);
  });

  test("削除済みのキーを再度削除しても成功する", async ({ expect }) => {
    // 準備：
    const { storage } = setup();
    await storage.write(
      createSetContext("k1", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    await storage.delete(
      createDeleteContext("k1", { signal: AbortSignal.timeout(5000) }) as IStorage.DeleteContext,
    );

    // 実行と検証：
    await storage.delete(
      createDeleteContext("k1", { signal: AbortSignal.timeout(5000) }) as IStorage.DeleteContext,
    );
    expect(
      await storage.exists(
        createHasContext("k1", { signal: AbortSignal.timeout(5000) }) as IStorage.ExistsContext,
      ),
    ).toBe(false);
  });

  test("410 応答のキーを削除しても成功する", async ({ expect }) => {
    // 準備：
    // oxlint-disable-next-line unicorn/consistent-function-scoping
    const goneFetch: IFetch = () =>
      Promise.resolve(
        new Response(null, {
          status: 410,
          statusText: "Gone",
        }),
      );
    const storage = new Http("https://kv.example.com/store", { fetch: goneFetch });

    // 実行と検証：
    await expect(
      storage.delete(
        createDeleteContext("gone", {
          signal: AbortSignal.timeout(5000),
        }) as IStorage.DeleteContext,
      ),
    ).resolves.toBeUndefined();
  });
});

describe("欠番の読み取り", () => {
  test("存在しないキーの read は KeyNotFoundError を投げる", async ({ expect }) => {
    // 準備：
    const { storage } = setup();

    // 実行：
    const error = await captureRejection(
      storage.read(
        createGetContext("unknown", { signal: AbortSignal.timeout(5000) }) as IStorage.ReadContext,
      ),
    );

    // 検証：
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect((error as KeyNotFoundError).meta).toStrictEqual({ key: "unknown" });
  });

  test("410 応答のキーの read は KeyNotFoundError を投げる", async ({ expect }) => {
    // 準備：
    // oxlint-disable-next-line unicorn/consistent-function-scoping
    const goneFetch: IFetch = () =>
      Promise.resolve(
        new Response(null, {
          status: 410,
          statusText: "Gone",
        }),
      );
    const storage = new Http("https://kv.example.com/store", { fetch: goneFetch });

    // 実行：
    const error = await captureRejection(
      storage.read(
        createGetContext("gone", { signal: AbortSignal.timeout(5000) }) as IStorage.ReadContext,
      ),
    );

    // 検証：
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect((error as KeyNotFoundError).meta).toStrictEqual({ key: "gone" });
  });

  test("中断済みシグナルでの read は中断例外を投げる", async ({ expect }) => {
    // 準備：
    const { storage } = setup();

    // 実行：
    const error = await captureRejection(
      storage.read(createGetContext("k1", { signal: abortedSignal() }) as IStorage.ReadContext),
    );

    // 検証：
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("AbortError");
  });
});
