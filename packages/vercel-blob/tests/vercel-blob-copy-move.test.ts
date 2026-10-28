import { type IStorage, KeyNotFoundError } from "@unikvs/core";
import {
  type TestContextInit,
  TestContext,
  abortedSignal,
  captureRejection,
  createGetContext,
  createHasContext,
  createSetContext,
} from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

import { BlobOperationError } from "../src/errors.js";
import VercelBlob, { type BlobClientLike } from "../src/vercel-blob.js";
import { createFakeClient, createFakeDownload } from "./_helpers.js";

/**
 * 複製用のコンテキストを組み立てます。
 *
 * @param key 複製元のキーです。
 * @param destinationKey 複製先のキーです。
 * @param init 追加の初期値です。
 *
 * @returns 複製用のコンテキストです。
 */
function createCopyContext(
  key: string,
  destinationKey: string,
  init: Omit<TestContextInit, "action" | "key" | "destinationKey"> = {},
): IStorage.CopyContext {
  return new TestContext({
    ...init,
    action: "copy",
    key,
    destinationKey,
  }) as unknown as IStorage.CopyContext;
}

/**
 * 移動用のコンテキストを組み立てます。
 *
 * @param key 移動元のキーです。
 * @param destinationKey 移動先のキーです。
 * @param init 追加の初期値です。
 *
 * @returns 移動用のコンテキストです。
 */
function createMoveContext(
  key: string,
  destinationKey: string,
  init: Omit<TestContextInit, "action" | "key" | "destinationKey"> = {},
): IStorage.MoveContext {
  return new TestContext({
    ...init,
    action: "move",
    key,
    destinationKey,
  }) as unknown as IStorage.MoveContext;
}

/**
 * 疑似クライアントとストレージを組み立てます。
 *
 * @param options 疑似クライアントの任意項目です。
 *
 * @returns 疑似クライアントとストレージです。
 */
function setup(options: Parameters<typeof createFakeClient>[0] = {}): {
  client: ReturnType<typeof createFakeClient>;
  storage: VercelBlob;
} {
  const client = createFakeClient(options);
  const { fetch } = createFakeDownload(client.store);
  const storage = new VercelBlob({
    fetch,
    client,
  });

  return {
    client,
    storage,
  };
}

describe("複製と移動", () => {
  test("copy は複製元を残したまま複製先へ書き込む", async ({ expect }) => {
    // 準備：
    const { client, storage } = setup();
    const data = new Uint8Array([1, 2, 3]);
    await storage.write(
      createSetContext("source", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      data,
    );

    // 実行：
    await storage.copy(
      createCopyContext("source", "destination", { signal: AbortSignal.timeout(5000) }),
    );

    // 検証：
    expect(client.store.get("source")).toStrictEqual(data);
    expect(client.store.get("destination")).toStrictEqual(data);
    expect(client.calls.filter((call) => call.operation === "copy")).toStrictEqual([
      {
        token: undefined,
        access: "private",
        operation: "copy",
        toPathname: "destination",
        fromPathname: "source",
      },
    ]);
  });

  test("copy は既存の複製先を上書きする", async ({ expect }) => {
    // 準備：
    const { storage } = setup();
    const data = new Uint8Array([7, 8, 9]);
    await storage.write(
      createSetContext("source", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      data,
    );
    await storage.write(
      createSetContext("destination", {
        signal: AbortSignal.timeout(5000),
      }) as IStorage.WriteContext,
      new Uint8Array([1, 2, 3]),
    );

    // 実行：
    await storage.copy(
      createCopyContext("source", "destination", { signal: AbortSignal.timeout(5000) }),
    );

    // 検証：
    await expect(
      storage.read(
        createGetContext("destination", {
          signal: AbortSignal.timeout(5000),
        }) as IStorage.ReadContext,
      ),
    ).resolves.toStrictEqual(data);
  });

  test("copy は keyPrefix を複製元と複製先の両方に付与する", async ({ expect }) => {
    // 準備：
    const client = createFakeClient();
    const { fetch } = createFakeDownload(client.store);
    const storage = new VercelBlob({
      fetch,
      client,
      keyPrefix: "app/",
    });
    await storage.write(
      createSetContext("source", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      new Uint8Array([4, 5, 6]),
    );

    // 実行：
    await storage.copy(
      createCopyContext("source", "destination", { signal: AbortSignal.timeout(5000) }),
    );

    // 検証：
    expect([...client.store.keys()]).toStrictEqual(["app/source", "app/destination"]);
  });

  test("copy はネイティブの複製操作がないクライアントでも動作する", async ({ expect }) => {
    // 準備：
    const { client } = setup();
    const clientWithoutCopy: BlobClientLike = {
      del: (pathname, options) => client.del(pathname, options),
      put: (pathname, body, options) => client.put(pathname, body, options),
      head: (pathname, options) => client.head(pathname, options),
      list: (options) => client.list(options),
    };
    const fallbackStorage = new VercelBlob({
      fetch: createFakeDownload(client.store).fetch,
      client: clientWithoutCopy,
    });
    const data = new Uint8Array([10, 11, 12]);
    await fallbackStorage.write(
      createSetContext("source", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      data,
    );

    // 実行：
    await fallbackStorage.copy(
      createCopyContext("source", "destination", { signal: AbortSignal.timeout(5000) }),
    );

    // 検証：
    expect(client.store.get("destination")).toStrictEqual(data);
    expect(client.calls.filter((call) => call.operation === "copy")).toStrictEqual([]);
  });

  test("move は複製先へ書き込んでから複製元を削除する", async ({ expect }) => {
    // 準備：
    const { client, storage } = setup();
    const data = new Uint8Array([13, 14, 15]);
    await storage.write(
      createSetContext("source", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      data,
    );

    // 実行：
    await storage.move(
      createMoveContext("source", "destination", { signal: AbortSignal.timeout(5000) }),
    );

    // 検証：
    expect(client.store.has("source")).toBe(false);
    await expect(
      storage.read(
        createGetContext("destination", {
          signal: AbortSignal.timeout(5000),
        }) as IStorage.ReadContext,
      ),
    ).resolves.toStrictEqual(data);
  });

  test("move は既存の移動先を上書きする", async ({ expect }) => {
    // 準備：
    const { storage } = setup();
    const data = new Uint8Array([16, 17, 18]);
    await storage.write(
      createSetContext("source", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      data,
    );
    await storage.write(
      createSetContext("destination", {
        signal: AbortSignal.timeout(5000),
      }) as IStorage.WriteContext,
      new Uint8Array([1, 2, 3]),
    );

    // 実行：
    await storage.move(
      createMoveContext("source", "destination", { signal: AbortSignal.timeout(5000) }),
    );

    // 検証：
    await expect(
      storage.read(
        createGetContext("destination", {
          signal: AbortSignal.timeout(5000),
        }) as IStorage.ReadContext,
      ),
    ).resolves.toStrictEqual(data);
  });

  test("存在しないキーの copy は KeyNotFoundError を投げる", async ({ expect }) => {
    // 準備：
    const { storage } = setup();

    // 実行：
    const error = await captureRejection(
      storage.copy(
        createCopyContext("missing", "destination", { signal: AbortSignal.timeout(5000) }),
      ),
    );

    // 検証：
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect((error as KeyNotFoundError).meta).toStrictEqual({ key: "missing" });
  });

  test("存在しないキーの move は KeyNotFoundError を投げる", async ({ expect }) => {
    // 準備：
    const { storage } = setup();

    // 実行と検証：
    await expect(
      storage.move(
        createMoveContext("missing", "destination", { signal: AbortSignal.timeout(5000) }),
      ),
    ).rejects.toBeInstanceOf(KeyNotFoundError);
  });

  test("同じキーへの copy と move は値の存在確認だけを行う", async ({ expect }) => {
    // 準備：
    const { client, storage } = setup();
    const data = new Uint8Array([19, 20, 21]);
    await storage.write(
      createSetContext("same", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      data,
    );

    // 実行：
    await storage.copy(createCopyContext("same", "same", { signal: AbortSignal.timeout(5000) }));
    await storage.move(createMoveContext("same", "same", { signal: AbortSignal.timeout(5000) }));

    // 検証：
    expect(client.calls.filter((call) => call.operation === "copy")).toStrictEqual([]);
    expect(client.calls.filter((call) => call.operation === "del")).toStrictEqual([]);
    await expect(
      storage.read(
        createGetContext("same", { signal: AbortSignal.timeout(5000) }) as IStorage.ReadContext,
      ),
    ).resolves.toStrictEqual(data);
  });

  test("存在しないキーを同じキーへ copy すると KeyNotFoundError を投げる", async ({ expect }) => {
    // 準備：
    const { storage } = setup();

    // 実行と検証：
    await expect(
      storage.copy(
        createCopyContext("same-missing", "same-missing", {
          signal: AbortSignal.timeout(5000),
        }),
      ),
    ).rejects.toBeInstanceOf(KeyNotFoundError);
  });

  test("存在しないキーを同じキーへ move すると KeyNotFoundError を投げる", async ({ expect }) => {
    // 準備：
    const { storage } = setup();

    // 実行と検証：
    await expect(
      storage.move(
        createMoveContext("same-missing", "same-missing", {
          signal: AbortSignal.timeout(5000),
        }),
      ),
    ).rejects.toBeInstanceOf(KeyNotFoundError);
  });

  test("copy の失敗は BlobOperationError になり、複製元を残す", async ({ expect }) => {
    // 準備：
    const failure = new Error("copy failed");
    const { client, storage } = setup({
      error: failure,
      failOn: "copy",
    });
    await storage.write(
      createSetContext("source", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      new Uint8Array([22, 23, 24]),
    );

    // 実行：
    const error = await captureRejection(
      storage.copy(
        createCopyContext("source", "destination", { signal: AbortSignal.timeout(5000) }),
      ),
    );

    // 検証：
    expect(error).toBeInstanceOf(BlobOperationError);
    expect((error as BlobOperationError).meta).toStrictEqual({
      key: "source",
      operation: "copy",
    });

    expect(client.store.has("source")).toBe(true);
    expect(client.store.has("destination")).toBe(false);
  });

  test("中断済みシグナルでの copy と move は中断例外を投げる", async ({ expect }) => {
    // 準備：
    const { storage } = setup();

    // 実行と検証：
    await expect(
      storage.copy(createCopyContext("source", "destination", { signal: abortedSignal() })),
    ).rejects.toMatchObject({ name: "AbortError" });
    await expect(
      storage.move(createMoveContext("source", "destination", { signal: abortedSignal() })),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  test("move 後の移動先は exists が true になる", async ({ expect }) => {
    // 準備：
    const { storage } = setup();
    await storage.write(
      createSetContext("source", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      new Uint8Array([25]),
    );

    // 実行：
    await storage.move(
      createMoveContext("source", "destination", { signal: AbortSignal.timeout(5000) }),
    );

    // 検証：
    await expect(
      storage.exists(
        createHasContext("destination", {
          signal: AbortSignal.timeout(5000),
        }) as IStorage.ExistsContext,
      ),
    ).resolves.toBe(true);
  });
});
