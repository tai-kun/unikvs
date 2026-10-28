import type { IStorage } from "@unikvs/core";
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

import { KeyNotFoundError } from "../src/errors.js";
import VercelRuntimeCache from "../src/vercel-runtime-cache.js";
import { createFakeRuntimeCache } from "./_helpers.js";

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

describe("複製と移動 (フォールバック)", () => {
  test("copy は複製元を残したまま複製先へ書き込む", async ({ expect }) => {
    // 準備：
    const storage = new VercelRuntimeCache({ ttlSeconds: 60 });
    await storage.write(createSetContext("source") as IStorage.WriteContext, "value");

    // 実行：
    await storage.copy(createCopyContext("source", "destination"));

    // 検証：
    await expect(storage.read(createGetContext("source") as IStorage.ReadContext)).resolves.toBe(
      "value",
    );
    await expect(
      storage.read(createGetContext("destination") as IStorage.ReadContext),
    ).resolves.toBe("value");
  });

  test("copy は既存の複製先を上書きする", async ({ expect }) => {
    // 準備：
    const storage = new VercelRuntimeCache({ ttlSeconds: 60 });
    await storage.write(createSetContext("source") as IStorage.WriteContext, "new-value");
    await storage.write(createSetContext("destination") as IStorage.WriteContext, "old-value");

    // 実行：
    await storage.copy(createCopyContext("source", "destination"));

    // 検証：
    await expect(
      storage.read(createGetContext("destination") as IStorage.ReadContext),
    ).resolves.toBe("new-value");
  });

  test("move は移動先へ書き込んでから移動元を削除する", async ({ expect }) => {
    // 準備：
    const storage = new VercelRuntimeCache({ ttlSeconds: 60 });
    await storage.write(createSetContext("source") as IStorage.WriteContext, "value");

    // 実行：
    await storage.move(createMoveContext("source", "destination"));

    // 検証：
    await expect(
      storage.exists(createHasContext("source") as IStorage.ExistsContext),
    ).resolves.toBe(false);
    await expect(
      storage.read(createGetContext("destination") as IStorage.ReadContext),
    ).resolves.toBe("value");
  });

  test("move は既存の移動先を上書きする", async ({ expect }) => {
    // 準備：
    const storage = new VercelRuntimeCache({ ttlSeconds: 60 });
    await storage.write(createSetContext("source") as IStorage.WriteContext, "new-value");
    await storage.write(createSetContext("destination") as IStorage.WriteContext, "old-value");

    // 実行：
    await storage.move(createMoveContext("source", "destination"));

    // 検証：
    await expect(
      storage.read(createGetContext("destination") as IStorage.ReadContext),
    ).resolves.toBe("new-value");
  });

  test("存在しないキーの copy は KeyNotFoundError を投げる", async ({ expect }) => {
    // 準備：
    const storage = new VercelRuntimeCache();

    // 実行と検証：
    await expect(storage.copy(createCopyContext("missing", "destination"))).rejects.toBeInstanceOf(
      KeyNotFoundError,
    );
  });

  test("存在しないキーの move は KeyNotFoundError を投げる", async ({ expect }) => {
    // 準備：
    const storage = new VercelRuntimeCache();

    // 実行と検証：
    await expect(storage.move(createMoveContext("missing", "destination"))).rejects.toBeInstanceOf(
      KeyNotFoundError,
    );
  });

  test("同じキーへの copy と move は値の存在確認だけを行う", async ({ expect }) => {
    // 準備：
    const storage = new VercelRuntimeCache({ ttlSeconds: 60 });
    await storage.write(createSetContext("same") as IStorage.WriteContext, "value");

    // 実行：
    await storage.copy(createCopyContext("same", "same"));
    await storage.move(createMoveContext("same", "same"));

    // 検証：
    await expect(storage.read(createGetContext("same") as IStorage.ReadContext)).resolves.toBe(
      "value",
    );
  });

  test("存在しないキーを同じキーへ copy すると KeyNotFoundError を投げる", async ({ expect }) => {
    // 準備：
    const storage = new VercelRuntimeCache();

    // 実行と検証：
    await expect(storage.copy(createCopyContext("missing", "missing"))).rejects.toBeInstanceOf(
      KeyNotFoundError,
    );
  });

  test("存在しないキーを同じキーへ move すると KeyNotFoundError を投げる", async ({ expect }) => {
    // 準備：
    const storage = new VercelRuntimeCache();

    // 実行と検証：
    await expect(storage.move(createMoveContext("missing", "missing"))).rejects.toBeInstanceOf(
      KeyNotFoundError,
    );
  });

  test("copy は値を複製する", async ({ expect }) => {
    // 準備：
    const storage = new VercelRuntimeCache({ ttlSeconds: 60 });
    const source = { nested: { value: 1 } };
    await storage.write(createSetContext("source") as IStorage.WriteContext, source);

    // 実行：
    await storage.copy(createCopyContext("source", "destination"));
    source.nested.value = 99;

    // 検証：
    await expect(
      storage.read(createGetContext("destination") as IStorage.ReadContext),
    ).resolves.toStrictEqual({ nested: { value: 1 } });
  });

  test("copy と move は新しい TTL を設定する", async ({ expect }) => {
    // 準備：
    let now = 0;
    const storage = new VercelRuntimeCache({
      now: (): number => now,
      ttlSeconds: 10,
    });
    await storage.write(createSetContext("source") as IStorage.WriteContext, "value");
    await storage.write(createSetContext("move-source") as IStorage.WriteContext, "moved-value");
    now += 9000;

    // 実行：
    await storage.copy(createCopyContext("source", "destination"));
    await storage.move(createMoveContext("move-source", "moved"));

    // 検証：
    now += 9000;
    await expect(
      storage.read(createGetContext("destination") as IStorage.ReadContext),
    ).resolves.toBe("value");
    await expect(storage.read(createGetContext("moved") as IStorage.ReadContext)).resolves.toBe(
      "moved-value",
    );
  });

  test("中断済みシグナルでの copy と move は中断例外を投げる", async ({ expect }) => {
    // 準備：
    const storage = new VercelRuntimeCache();

    // 実行と検証：
    await expect(
      storage.copy(createCopyContext("source", "destination", { signal: abortedSignal() })),
    ).rejects.toMatchObject({ name: "AbortError" });
    await expect(
      storage.move(createMoveContext("source", "destination", { signal: abortedSignal() })),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  test("move は maxEntries による移動元の追い出し後でも成功する", async ({ expect }) => {
    // 準備：
    const storage = new VercelRuntimeCache({
      maxEntries: 1,
      ttlSeconds: 60,
    });
    await storage.write(createSetContext("source") as IStorage.WriteContext, "value");

    // 実行：
    await storage.move(createMoveContext("source", "destination"));

    // 検証：
    await expect(
      storage.read(createGetContext("destination") as IStorage.ReadContext),
    ).resolves.toBe("value");
    await expect(
      storage.exists(createHasContext("source") as IStorage.ExistsContext),
    ).resolves.toBe(false);
  });
});

describe("複製と移動 (バックエンド)", () => {
  test("copy と move は名前空間付きのキーを使う", async ({ expect }) => {
    // 準備：
    const backend = createFakeRuntimeCache();
    const storage = new VercelRuntimeCache({
      backend,
      namespace: "ns",
      ttlSeconds: 30,
    });
    await storage.write(createSetContext("source") as IStorage.WriteContext, "value");

    // 実行：
    await storage.copy(createCopyContext("source", "copy"));
    await storage.move(createMoveContext("source", "move"));

    // 検証：
    expect(backend.store.has("ns:copy")).toBe(true);
    expect(backend.store.has("ns:move")).toBe(true);
  });

  test("move はバックエンドから移動元を削除する", async ({ expect }) => {
    // 準備：
    const backend = createFakeRuntimeCache();
    const storage = new VercelRuntimeCache({
      backend,
      ttlSeconds: 30,
    });
    await storage.write(createSetContext("source") as IStorage.WriteContext, "value");

    // 実行：
    await storage.move(createMoveContext("source", "destination"));

    // 検証：
    expect(backend.store.has("source")).toBe(false);
    expect(backend.store.has("destination")).toBe(true);
    await expect(
      storage.read(createGetContext("destination") as IStorage.ReadContext),
    ).resolves.toBe("value");
  });

  test("copy はバックエンドへ ttlSeconds を渡す", async ({ expect }) => {
    // 準備：
    const backend = createFakeRuntimeCache();
    const storage = new VercelRuntimeCache({
      backend,
      ttlSeconds: 30,
    });
    await storage.write(createSetContext("source") as IStorage.WriteContext, "value");

    // 実行：
    await storage.copy(createCopyContext("source", "destination"));

    // 検証：
    expect(backend.setCalls.at(-1)).toStrictEqual({
      key: "destination",
      options: { ttlSeconds: 30 },
    });
  });

  test("存在しないキーの copy は KeyNotFoundError を投げる", async ({ expect }) => {
    // 準備：
    const storage = new VercelRuntimeCache({ backend: createFakeRuntimeCache() });

    // 実行：
    const error = await captureRejection(storage.copy(createCopyContext("missing", "destination")));

    // 検証：
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect((error as KeyNotFoundError).meta).toStrictEqual({ key: "missing" });
  });

  test("期限切れのキーの move は KeyNotFoundError を投げる", async ({ expect }) => {
    // 準備：
    let now = 0;
    const backend = createFakeRuntimeCache();
    const storage = new VercelRuntimeCache({
      now: (): number => now,
      backend,
      ttlSeconds: 10,
    });
    await storage.write(createSetContext("source") as IStorage.WriteContext, "value");
    now += 11_000;

    // 実行と検証：
    await expect(storage.move(createMoveContext("source", "destination"))).rejects.toBeInstanceOf(
      KeyNotFoundError,
    );
    expect(backend.store.has("source")).toBe(false);
    expect(backend.store.has("destination")).toBe(false);
  });

  test("移動先の書き込みに失敗したときは移動元を残す", async ({ expect }) => {
    // 準備：
    const failure = new Error("backend write failed");
    const now = 1000;
    const backend = createFakeRuntimeCache();
    backend.store.set("source", {
      value: "value",
      expiresAt: now + 30_000,
    });
    backend.set = async (): Promise<void> => {
      throw failure;
    };

    const storage = new VercelRuntimeCache({
      now: (): number => now,
      backend,
      ttlSeconds: 30,
    });

    // 実行：
    const error = await captureRejection(storage.move(createMoveContext("source", "destination")));

    // 検証：
    expect(error).toBe(failure);

    expect(backend.store.has("source")).toBe(true);
    expect(backend.store.has("destination")).toBe(false);
  });
});
