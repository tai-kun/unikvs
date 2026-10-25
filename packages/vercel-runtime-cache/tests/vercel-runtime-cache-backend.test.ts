import type { IStorage } from "@unikvs/core";
import {
  captureRejection,
  createGetContext,
  createHasContext,
  createSetContext,
  createClearContext,
  createDeleteContext,
  createStreamContext,
} from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

import { KeyNotFoundError, InvalidChunkTypeError } from "../src/errors.js";
import VercelRuntimeCache from "../src/vercel-runtime-cache.js";
import { createFakeRuntimeCache } from "./_helpers.js";

/**
 * グローバルへ退避した値を元に戻します。
 * ランタイムキャッシュ検出の検証での汚染防止に使用します。
 */
function restoreGlobalValue(target: Record<string, unknown>, key: string, previous: unknown): void {
  if (previous === undefined) {
    delete target[key];
  } else {
    target[key] = previous;
  }
}

describe("バックエンド委譲 (Vercel ランタイム結合)", () => {
  test("フォールバック時は backend が undefined", ({ expect }) => {
    const storage = new VercelRuntimeCache();
    expect(storage.backend).toBeUndefined();
  });

  test("明示バックエンドに読み書きできる", async ({ expect }) => {
    const backend = createFakeRuntimeCache();
    const storage = new VercelRuntimeCache({ backend });
    expect(storage.backend).toBe(backend);
    await storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    await expect(storage.read(createGetContext("k1") as IStorage.ReadContext)).resolves.toBe("v1");
    await expect(storage.exists(createHasContext("k1") as IStorage.ExistsContext)).resolves.toBe(
      true,
    );
  });

  test("バックエンドの欠落は KeyNotFoundError", async ({ expect }) => {
    const backend = createFakeRuntimeCache();
    const storage = new VercelRuntimeCache({ backend });
    await expect(
      storage.read(createGetContext("missing") as IStorage.ReadContext),
    ).rejects.toBeInstanceOf(KeyNotFoundError);
    await expect(
      storage.exists(createHasContext("missing") as IStorage.ExistsContext),
    ).resolves.toBe(false);
    await expect(
      storage.delete(createDeleteContext("missing") as IStorage.DeleteContext),
    ).rejects.toBeInstanceOf(KeyNotFoundError);
  });

  test("バックエンドの素の値 (エンベロープなし) も読める", async ({ expect }) => {
    const backend = createFakeRuntimeCache();
    backend.store.set("k1", "raw-value");

    const storage = new VercelRuntimeCache({ backend });
    await expect(storage.read(createGetContext("k1") as IStorage.ReadContext)).resolves.toBe(
      "raw-value",
    );
    await expect(storage.exists(createHasContext("k1") as IStorage.ExistsContext)).resolves.toBe(
      true,
    );
  });

  test("バックエンドの期限切れエントリは削除して KeyNotFoundError", async ({ expect }) => {
    let now = 0;
    const backend = createFakeRuntimeCache();
    const storage = new VercelRuntimeCache({
      now: (): number => now,
      backend,
      ttlSeconds: 10,
    });
    await storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    now += 11_000;
    await expect(
      storage.read(createGetContext("k1") as IStorage.ReadContext),
    ).rejects.toBeInstanceOf(KeyNotFoundError);
    expect(backend.store.has("k1")).toBe(false);
  });

  test("バックエンドの期限切れ delete は削除して KeyNotFoundError", async ({ expect }) => {
    let now = 0;
    const backend = createFakeRuntimeCache();
    const storage = new VercelRuntimeCache({
      now: (): number => now,
      backend,
      ttlSeconds: 10,
    });
    await storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    now += 11_000;
    await expect(
      storage.delete(createDeleteContext("k1") as IStorage.DeleteContext),
    ).rejects.toBeInstanceOf(KeyNotFoundError);
    expect(backend.store.has("k1")).toBe(false);
  });

  test("undefined を保存したキーも exists は true", async ({ expect }) => {
    const backend = createFakeRuntimeCache();
    const storage = new VercelRuntimeCache({ backend });
    await storage.write(createSetContext("k1") as IStorage.WriteContext, undefined);
    await expect(storage.exists(createHasContext("k1") as IStorage.ExistsContext)).resolves.toBe(
      true,
    );
    await expect(
      storage.read(createGetContext("k1") as IStorage.ReadContext),
    ).resolves.toBeUndefined();
  });

  test("バックエンドへ ttlSeconds を渡す", async ({ expect }) => {
    const backend = createFakeRuntimeCache();
    const storage = new VercelRuntimeCache({
      backend,
      ttlSeconds: 30,
    });
    await storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    expect(backend.setCalls).toHaveLength(1);
    expect(backend.setCalls[0]?.key).toBe("k1");
    expect(backend.setCalls[0]?.options).toStrictEqual({ ttlSeconds: 30 });
  });

  test("バックエンドの delete と clear が効く", async ({ expect }) => {
    const backend = createFakeRuntimeCache();
    const storage = new VercelRuntimeCache({ backend });
    await storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    await storage.delete(createDeleteContext("k1") as IStorage.DeleteContext);
    await expect(storage.exists(createHasContext("k1") as IStorage.ExistsContext)).resolves.toBe(
      false,
    );
    await storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    await storage.clear(createClearContext() as IStorage.ClearContext);
    await expect(storage.exists(createHasContext("k1") as IStorage.ExistsContext)).resolves.toBe(
      false,
    );
  });

  test("backend.clear がなくても書き込んだキーをすべて削除する", async ({ expect }) => {
    const backend = createFakeRuntimeCache({ supportsClear: false });
    const storage = new VercelRuntimeCache({ backend });
    await storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    await storage.write(createSetContext("k2") as IStorage.WriteContext, "v2");
    await storage.clear(createClearContext() as IStorage.ClearContext);
    expect(backend.store.size).toBe(0);
    await expect(storage.exists(createHasContext("k1") as IStorage.ExistsContext)).resolves.toBe(
      false,
    );
    await expect(storage.exists(createHasContext("k2") as IStorage.ExistsContext)).resolves.toBe(
      false,
    );
  });

  test("namespace 付きバックエンドは接頭辞で分離される", async ({ expect }) => {
    const backend = createFakeRuntimeCache();
    const storage = new VercelRuntimeCache({
      backend,
      namespace: "ns",
    });
    await storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    expect(backend.store.has("ns:k1")).toBe(true);
    await expect(storage.read(createGetContext("k1") as IStorage.ReadContext)).resolves.toBe("v1");
  });

  test("グローバルから Vercel ランタイムキャッシュを検出する", async ({ expect }) => {
    const backend = createFakeRuntimeCache();
    const g = globalThis as Record<string, unknown>;
    const prev = g["__VERCEL_RUNTIME_CACHE__"];
    g["__VERCEL_RUNTIME_CACHE__"] = backend;

    try {
      const storage = new VercelRuntimeCache();
      expect(storage.backend).toBe(backend);
      await storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");
      await expect(storage.read(createGetContext("k1") as IStorage.ReadContext)).resolves.toBe(
        "v1",
      );
    } finally {
      restoreGlobalValue(g, "__VERCEL_RUNTIME_CACHE__", prev);
    }
  });
});

describe("ストリーム", () => {
  test("getWritable で書き込んだ値を read できる", async ({ expect }) => {
    const storage = new VercelRuntimeCache();
    const writer = storage
      .getWritable(createSetContext("s1") as IStorage.GetWritableContext)
      .getWriter();
    await writer.write(new Uint8Array([1, 2, 3]));
    await writer.write(new Uint8Array([4]));
    await writer.close();
    await expect(
      storage.read(createGetContext("s1") as IStorage.ReadContext),
    ).resolves.toStrictEqual(new Uint8Array([1, 2, 3, 4]));
  });

  test("空のストリームを close すると空のバイト列が保存される", async ({ expect }) => {
    const storage = new VercelRuntimeCache();
    const writer = storage
      .getWritable(createSetContext("s1") as IStorage.GetWritableContext)
      .getWriter();
    await writer.close();
    await expect(storage.exists(createHasContext("s1") as IStorage.ExistsContext)).resolves.toBe(
      true,
    );
    await expect(
      storage.read(createGetContext("s1") as IStorage.ReadContext),
    ).resolves.toStrictEqual(new Uint8Array(0));
  });

  test("Uint8Array 以外のチャンクは InvalidChunkTypeError", async ({ expect }) => {
    const storage = new VercelRuntimeCache();
    const writer = storage
      .getWritable(createSetContext("s1") as IStorage.GetWritableContext)
      .getWriter();

    const error = await captureRejection(
      writer.write("invalid" as unknown as Uint8Array<ArrayBuffer>),
    );
    expect(error).toBeInstanceOf(InvalidChunkTypeError);
  });

  test("getReadable で単一チャンクを得られる", async ({ expect }) => {
    const storage = new VercelRuntimeCache();
    await storage.write(createSetContext("s1") as IStorage.WriteContext, new Uint8Array([1, 2, 3]));

    const stream = await storage.getReadable(
      createStreamContext("s1") as IStorage.GetReadableContext,
    );
    const reader = stream.getReader();
    const first = await reader.read();
    const second = await reader.read();
    expect(first.done).toBe(false);
    expect(first.value).toStrictEqual(new Uint8Array([1, 2, 3]));
    expect(second.done).toBe(true);
  });

  test("存在しないキーの getReadable は KeyNotFoundError", async ({ expect }) => {
    const storage = new VercelRuntimeCache();
    await expect(
      storage.getReadable(createStreamContext("missing") as IStorage.GetReadableContext),
    ).rejects.toBeInstanceOf(KeyNotFoundError);
  });

  test("非 Uint8Array 値の getReadable は読み取り時に InvalidChunkTypeError", async ({
    expect,
  }) => {
    const storage = new VercelRuntimeCache();
    await storage.write(createSetContext("s1") as IStorage.WriteContext, "not-bytes");

    const stream = await storage.getReadable(
      createStreamContext("s1") as IStorage.GetReadableContext,
    );
    const reader = stream.getReader();

    const error = await captureRejection(reader.read());
    expect(error).toBeInstanceOf(InvalidChunkTypeError);
  });
});
