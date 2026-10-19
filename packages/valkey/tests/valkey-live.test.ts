import type { IStorage } from "@unikvs/core";
import {
  bytesEqual,
  collectBytes,
  concatBytes,
  createAllByteValues,
  createClearContext,
  createCloseContext,
  createDeleteContext,
  createGetContext,
  createHasContext,
  createOpenContext,
  createSetContext,
  createStreamContext,
} from "@unikvs/testing";
import { describe, test } from "vitest";

import { KeyNotFoundError } from "../src/errors.js";
import Valkey from "../src/valkey.js";
import { liveUrl } from "./_helpers.js";

const url = liveUrl();

// `VALKEY_URL` (または `REDIS_URL`) が未設定の環境ではライブテストを実行しません。
// Valkey は Redis プロトコルと互換性があるため、Redis サーバーへの接続も検証に使えます。
const describeLive = url === undefined ? describe.skip : describe;

function randomKeyPrefix(): string {
  return `unikvs-live-${crypto.randomUUID()}:`;
}

describeLive("ライブサーバー (CRUD)", () => {
  test("データが byte-for-byte で往復する", async ({ expect, signal }) => {
    // 準備
    const storage = new Valkey(url, { keyPrefix: randomKeyPrefix() });
    await storage.open(createOpenContext() as IStorage.OpenContext);

    try {
      const key = "live-roundtrip.bin";
      const data = createAllByteValues(4096);

      // 実行
      await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);
      const result = await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);

      // 検証
      expect(bytesEqual(result, data)).toBe(true);
    } finally {
      await storage.close(createCloseContext() as IStorage.CloseContext);
    }
  });

  test("削除と存在確認が期待どおりに動く", async ({ expect, signal }) => {
    // 準備
    const storage = new Valkey(url, { keyPrefix: randomKeyPrefix() });
    await storage.open(createOpenContext() as IStorage.OpenContext);

    try {
      const key = "live-exists.bin";
      await storage.write(
        createSetContext(key, { signal }) as IStorage.WriteContext,
        new Uint8Array([1]),
      );

      // 実行と検証
      await expect(
        storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext),
      ).resolves.toBe(true);
      await storage.delete(createDeleteContext(key, { signal }) as IStorage.DeleteContext);
      await expect(
        storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext),
      ).resolves.toBe(false);
      await expect(
        storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
      ).rejects.toThrow(KeyNotFoundError);
    } finally {
      await storage.close(createCloseContext() as IStorage.CloseContext);
    }
  });

  test("ttl を指定したとき、期限切れのキーは読み取れなくなる", async ({ expect, signal }) => {
    // 準備
    const storage = new Valkey(url, { keyPrefix: randomKeyPrefix(), ttl: 200 });
    await storage.open(createOpenContext() as IStorage.OpenContext);

    try {
      const key = "live-ttl.bin";
      await storage.write(
        createSetContext(key, { signal }) as IStorage.WriteContext,
        new Uint8Array([1, 2, 3]),
      );

      // 実行
      // 有効期限 (200ms) を十分に超えるまで待つ。
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // 検証
      await expect(
        storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext),
      ).resolves.toBe(false);
      await expect(
        storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
      ).rejects.toThrow(KeyNotFoundError);
    } finally {
      await storage.close(createCloseContext() as IStorage.CloseContext);
    }
  });

  test("clear は自プレフィックスのみを削除する", async ({ expect, signal }) => {
    // 準備
    const keyPrefix = randomKeyPrefix();
    const storage = new Valkey(url, { keyPrefix });
    await storage.open(createOpenContext() as IStorage.OpenContext);

    try {
      await storage.write(
        createSetContext("a.bin", { signal }) as IStorage.WriteContext,
        new Uint8Array([1]),
      );
      await storage.write(
        createSetContext("b.bin", { signal }) as IStorage.WriteContext,
        new Uint8Array([2]),
      );

      // 実行
      await storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);

      // 検証
      await expect(
        storage.exists(createHasContext("a.bin", { signal }) as IStorage.ExistsContext),
      ).resolves.toBe(false);
      await expect(
        storage.exists(createHasContext("b.bin", { signal }) as IStorage.ExistsContext),
      ).resolves.toBe(false);
    } finally {
      await storage.close(createCloseContext() as IStorage.CloseContext);
    }
  });
});

describeLive("ライブサーバー (ストリーム)", () => {
  test("書き込みストリームの内容が swap-on-close で保存される", async ({ expect, signal }) => {
    // 準備
    const storage = new Valkey(url, { keyPrefix: randomKeyPrefix() });
    await storage.open(createOpenContext() as IStorage.OpenContext);

    try {
      const key = "live-stream.dat";
      const chunks = [new Uint8Array([1, 2, 3]), new TextEncoder().encode("hello")];
      const expected = concatBytes(chunks);
      const writer = storage
        .getWritable(createSetContext(key, { signal }) as IStorage.GetWritableContext)
        .getWriter();

      // 実行
      for (const chunk of chunks) {
        await writer.write(chunk);
      }
      await writer.close();

      // 検証
      const readable = storage.getReadable(
        createStreamContext(key, { signal }) as IStorage.GetReadableContext,
      );
      expect(bytesEqual(await collectBytes(readable), expected)).toBe(true);
    } finally {
      await storage.close(createCloseContext() as IStorage.CloseContext);
    }
  });
});
