// oxlint-disable unicorn/number-literal-case
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

import { KeyNotFoundError } from "../src/errors.js";
import VercelBlob, { type IFetch } from "../src/vercel-blob.js";
import { createFakeClient, createFakeDownload } from "./_helpers.js";

/**
 * 毎回新しい疑似クライアントと VercelBlob を組み立てます。
 * バイナリー往復の検証に使用します。
 */
function setup(): {
  store: Map<string, Uint8Array>;
  storage: VercelBlob;
} {
  const client = createFakeClient();
  const { fetch } = createFakeDownload(client.store);
  const storage = new VercelBlob({
    fetch,
    client,
  });

  return {
    store: client.store,
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

  test("書き込み中に元の配列を変更しても保存値は変わらない", async ({ expect }) => {
    // 準備：
    const { storage } = setup();
    const data = new Uint8Array([1, 2, 3]);

    // 実行：
    const pending = storage.write(
      createSetContext("k1", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      data,
    );
    data[0] = 99;
    await pending;

    // 検証：
    expect(
      await storage.read(
        createGetContext("k1", { signal: AbortSignal.timeout(5000) }) as IStorage.ReadContext,
      ),
    ).toStrictEqual(new Uint8Array([1, 2, 3]));
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

  test("存在しないキーの exists は false を返す", async ({ expect }) => {
    // 準備：
    const { storage } = setup();

    // 実行：
    const result = await storage.exists(
      createHasContext("unknown", { signal: AbortSignal.timeout(5000) }) as IStorage.ExistsContext,
    );

    // 検証：
    expect(result).toBe(false);
  });

  test("410 応答のキーの read は KeyNotFoundError を投げる", async ({ expect }) => {
    // 準備：
    const client = createFakeClient();
    // oxlint-disable-next-line unicorn/consistent-function-scoping
    const goneFetch: IFetch = async () =>
      new Response(null, {
        status: 410,
        statusText: "Gone",
      });
    const storage = new VercelBlob({
      fetch: goneFetch,
      client,
    });
    await storage.write(
      createSetContext("gone", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

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

  test("404 応答のキーの read は KeyNotFoundError を投げる", async ({ expect }) => {
    // 準備：
    const client = createFakeClient();
    // oxlint-disable-next-line unicorn/consistent-function-scoping
    const missingFetch: IFetch = async () =>
      new Response(null, {
        status: 404,
        statusText: "Not Found",
      });
    const storage = new VercelBlob({
      fetch: missingFetch,
      client,
    });
    await storage.write(
      createSetContext("gone", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

    // 実行：
    const error = await captureRejection(
      storage.read(
        createGetContext("gone", { signal: AbortSignal.timeout(5000) }) as IStorage.ReadContext,
      ),
    );

    // 検証：
    expect(error).toBeInstanceOf(KeyNotFoundError);
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

  test("中断済みシグナルでの exists は中断例外を投げる", async ({ expect }) => {
    // 準備：
    const { storage } = setup();

    // 実行：
    const error = await captureRejection(
      storage.exists(createHasContext("k1", { signal: abortedSignal() }) as IStorage.ExistsContext),
    );

    // 検証：
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("AbortError");
  });
});

describe("キー空間の分離", () => {
  test("keyPrefix を指定したとき、write した値を read・exists・delete できる", async ({
    expect,
  }) => {
    // 準備：
    const client = createFakeClient();
    const { fetch } = createFakeDownload(client.store);
    const storage = new VercelBlob({
      fetch,
      client,
      keyPrefix: "app/",
    });

    // 実行：
    await storage.write(
      createSetContext("k1", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      new Uint8Array([1, 2, 3]),
    );

    // 検証：
    expect([...client.store.keys()]).toStrictEqual(["app/k1"]);
    expect(
      await storage.read(
        createGetContext("k1", { signal: AbortSignal.timeout(5000) }) as IStorage.ReadContext,
      ),
    ).toStrictEqual(new Uint8Array([1, 2, 3]));
    expect(
      await storage.exists(
        createHasContext("k1", { signal: AbortSignal.timeout(5000) }) as IStorage.ExistsContext,
      ),
    ).toBe(true);

    // 実行：
    await storage.delete(
      createDeleteContext("k1", { signal: AbortSignal.timeout(5000) }) as IStorage.DeleteContext,
    );

    // 検証：
    expect([...client.store.keys()]).toStrictEqual([]);
    expect(
      await storage.exists(
        createHasContext("k1", { signal: AbortSignal.timeout(5000) }) as IStorage.ExistsContext,
      ),
    ).toBe(false);
  });
});
