import type { IStorage } from "@unikvs/core";
import {
  createClearContext,
  createDeleteContext,
  createGetContext,
  createHasContext,
  createSetContext,
  createStreamContext,
} from "@unikvs/testing";
import { describe, test } from "vitest";

import { InvalidChunkTypeError, KeyNotFoundError } from "../src/errors.js";
import VercelRuntimeCache, { type VercelRuntimeCacheBackend } from "../src/vercel-runtime-cache.js";

function createMapBackend() {
  const map = new Map<string, unknown>();
  const backend: VercelRuntimeCacheBackend = {
    get: (key: string) => map.get(key),
    set: (key: string, value: unknown) => {
      map.set(key, value);
    },
    delete: (key: string) => {
      map.delete(key);
    },
    clear: () => {
      map.clear();
    },
  };
  return { map, backend };
}

async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }

  throw new Error("Promise が拒否されませんでした");
}

describe("バックエンド委譲 (Vercel ランタイム結合)", () => {
  test("フォールバック時は backend が undefined", ({ expect }) => {
    const storage = new VercelRuntimeCache();

    expect(storage.backend).toBeUndefined();
  });

  test("明示バックエンドに読み書きできる", async ({ expect }) => {
    const { backend } = createMapBackend();
    const storage = new VercelRuntimeCache({ backend });
    expect(storage.backend).toBe(backend);

    await storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");

    await expect(storage.read(createGetContext("k1") as IStorage.ReadContext)).resolves.toBe("v1");
    await expect(storage.exists(createHasContext("k1") as IStorage.ExistsContext)).resolves.toBe(
      true,
    );
  });

  test("バックエンドの欠落は KeyNotFoundError", async ({ expect }) => {
    const { backend } = createMapBackend();
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
    const { map, backend } = createMapBackend();
    map.set("k1", "raw-value");
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
    const { backend } = createMapBackend();
    const storage = new VercelRuntimeCache({ ttlSeconds: 10, backend, now: () => now });
    await storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    now += 11_000;

    await expect(
      storage.read(createGetContext("k1") as IStorage.ReadContext),
    ).rejects.toBeInstanceOf(KeyNotFoundError);
  });

  test("バックエンドの期限切れ delete は KeyNotFoundError", async ({ expect }) => {
    let now = 0;
    const { backend } = createMapBackend();
    const storage = new VercelRuntimeCache({ ttlSeconds: 10, backend, now: () => now });
    await storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    now += 11_000;

    await expect(
      storage.delete(createDeleteContext("k1") as IStorage.DeleteContext),
    ).rejects.toBeInstanceOf(KeyNotFoundError);
  });

  test("バックエンドの delete と clear が効く", async ({ expect }) => {
    const { backend } = createMapBackend();
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

  test("clear に backend.clear がなければフォールバックを消す", async ({ expect }) => {
    const map = new Map<string, unknown>();
    const backend: VercelRuntimeCacheBackend = {
      get: (key: string) => map.get(key),
      set: (key: string, value: unknown) => {
        map.set(key, value);
      },
      delete: (key: string) => {
        map.delete(key);
      },
    };
    const storage = new VercelRuntimeCache({ backend });
    await storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    await storage.clear(createClearContext() as IStorage.ClearContext);

    await expect(storage.exists(createHasContext("k1") as IStorage.ExistsContext)).resolves.toBe(
      false,
    );
  });

  test("namespace 付きバックエンドは接頭辞で分離される", async ({ expect }) => {
    const { map, backend } = createMapBackend();
    const storage = new VercelRuntimeCache({ namespace: "ns", backend });
    await storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");

    expect(map.has("ns:k1")).toBe(true);
    await expect(storage.read(createGetContext("k1") as IStorage.ReadContext)).resolves.toBe("v1");
  });

  test("グローバルから Vercel ランタイムキャッシュを検出する", async ({ expect }) => {
    const { backend } = createMapBackend();
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
      if (prev === undefined) {
        delete g["__VERCEL_RUNTIME_CACHE__"];
      } else {
        g["__VERCEL_RUNTIME_CACHE__"] = prev;
      }
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
