import type { IStorage } from "@unikvs/core";
import {
  abortedSignal,
  captureRejection,
  createGetContext,
  createHasContext,
  createSetContext,
  createOpenContext,
  createCloseContext,
  createDeleteContext,
} from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

import { InvalidTokenError, InvalidAccessError } from "../src/errors.js";
import VercelBlob, { type VercelBlobOptions } from "../src/vercel-blob.js";
import { createFakeClient, createFakeDownload } from "./_helpers.js";

function setup(options: VercelBlobOptions = {}): {
  store: Map<string, Uint8Array>;
  storage: VercelBlob;
} {
  const client = createFakeClient();
  const { fetch } = createFakeDownload(client.store);
  const storage = new VercelBlob({
    client,
    fetch,
    ...options,
  });

  return {
    store: client.store,
    storage,
  };
}

describe("初期化と接続管理", () => {
  test("名前は VercelBlob である", ({ expect }) => {
    // 準備：
    const { storage } = setup();

    // 実行と検証：
    expect(storage.name).toBe("VercelBlob");
  });

  test("初期状態のとき、isOpen は true である", ({ expect }) => {
    // 準備：
    const { storage } = setup();

    // 実行と検証：
    expect(storage.isOpen).toBe(true);
  });

  test("open と close は中断なく成功し、isOpen は true のままである", async ({ expect }) => {
    // 準備：
    const { storage } = setup();

    // 実行：
    await storage.open(createOpenContext() as IStorage.OpenContext);
    await storage.close(createCloseContext() as IStorage.CloseContext);

    // 検証：
    expect(storage.isOpen).toBe(true);
  });

  test("中断済みシグナルでの open は中断例外を投げる", async ({ expect }) => {
    // 準備：
    const { storage } = setup();

    // 実行：
    const error = await captureRejection(
      storage.open(createOpenContext({ signal: abortedSignal() }) as IStorage.OpenContext),
    );

    // 検証：
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("AbortError");
  });

  test("中断済みシグナルでの close は中断例外を投げる", async ({ expect }) => {
    // 準備：
    const { storage } = setup();

    // 実行：
    const error = await captureRejection(
      storage.close(createCloseContext({ signal: abortedSignal() }) as IStorage.CloseContext),
    );

    // 検証：
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("AbortError");
  });

  test("中断済みシグナルでの write は中断例外を投げる", async ({ expect }) => {
    // 準備：
    const { storage } = setup();

    // 実行：
    const error = await captureRejection(
      storage.write(
        createSetContext("k1", { signal: abortedSignal() }) as IStorage.WriteContext,
        new Uint8Array([1]),
      ),
    );

    // 検証：
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("AbortError");
  });
});

describe("オプションの検証", () => {
  test("空文字の token は InvalidTokenError を投げる", ({ expect }) => {
    // 実行と検証：
    expect(() => new VercelBlob({ token: "" })).toThrow(InvalidTokenError);
  });

  test("文字列でない token は InvalidTokenError を投げる", ({ expect }) => {
    // 実行と検証：
    expect(() => new VercelBlob({ token: 42 as unknown as string })).toThrow(InvalidTokenError);
  });

  test("未知の access は InvalidAccessError を投げる", ({ expect }) => {
    // 実行と検証：
    expect(() => new VercelBlob({ access: "unknown" as "public" })).toThrow(InvalidAccessError);
  });
});

describe("基本操作（CRUD）", () => {
  test("データを保存したとき、そのキーでデータを取得できる", async ({ expect }) => {
    // 準備：
    const { storage } = setup();

    // 実行：
    await storage.write(
      createSetContext("k1", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      new Uint8Array([1, 2, 3]),
    );

    const result = await storage.read(
      createGetContext("k1", { signal: AbortSignal.timeout(5000) }) as IStorage.ReadContext,
    );

    // 検証：
    expect(result).toStrictEqual(new Uint8Array([1, 2, 3]));
  });

  test("データが存在するとき、exists が true を返す", async ({ expect }) => {
    // 準備：
    const { storage } = setup();
    await storage.write(
      createSetContext("k1", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

    // 実行：
    const result = await storage.exists(
      createHasContext("k1", { signal: AbortSignal.timeout(5000) }) as IStorage.ExistsContext,
    );

    // 検証：
    expect(result).toBe(true);
  });

  test("データを削除したとき、exists が false になる", async ({ expect }) => {
    // 準備：
    const { storage } = setup();
    await storage.write(
      createSetContext("k1", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

    // 実行：
    await storage.delete(
      createDeleteContext("k1", { signal: AbortSignal.timeout(5000) }) as IStorage.DeleteContext,
    );

    // 検証：
    expect(
      await storage.exists(
        createHasContext("k1", { signal: AbortSignal.timeout(5000) }) as IStorage.ExistsContext,
      ),
    ).toBe(false);
  });

  test("存在しないキーを削除しても成功する", async ({ expect }) => {
    // 準備：
    const { storage } = setup();

    // 実行と検証：
    await expect(
      storage.delete(
        createDeleteContext("none", {
          signal: AbortSignal.timeout(5000),
        }) as IStorage.DeleteContext,
      ),
    ).resolves.toBeUndefined();
  });

  test("中断済みシグナルでの delete は中断例外を投げる", async ({ expect }) => {
    // 準備：
    const { storage } = setup();

    // 実行：
    const error = await captureRejection(
      storage.delete(
        createDeleteContext("k1", { signal: abortedSignal() }) as IStorage.DeleteContext,
      ),
    );

    // 検証：
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("AbortError");
  });
});
