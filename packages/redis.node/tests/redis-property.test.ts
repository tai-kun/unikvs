import type { IStorage } from "@unikvs/core";
import {
  bytesEqual,
  concatBytes,
  forCasesAsync,
  createGetContext,
  createHasContext,
  createSetContext,
  createClearContext,
  createDeleteContext,
} from "@unikvs/testing";
import { describe } from "vite-plus/test";

import { test, listKeys } from "./_helpers.js";

describe("プロパティーベースの検証", () => {
  test("ランダムなキーとデータの CRUD が往復する", async ({ expect, signal, storage }) => {
    await forCasesAsync(24_301, 20, async (random) => {
      // 準備：
      const key = `prop/${random.uint(1_000_000_000)}/${random.string(6)}`;
      const data = random.bytes(random.uint(4096));

      // 実行：
      await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);

      // 検証：
      await expect(
        storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext),
      ).resolves.toBe(true);
      expect(
        bytesEqual(
          await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
          data,
        ),
      ).toBe(true);

      // 実行：
      const next = random.bytes(random.uint(4096));
      await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, next);

      // 検証：
      expect(
        bytesEqual(
          await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
          next,
        ),
      ).toBe(true);

      // 実行：
      await storage.delete(createDeleteContext(key, { signal }) as IStorage.DeleteContext);

      // 検証：
      await expect(
        storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext),
      ).resolves.toBe(false);
    });
  });

  test("ランダムなチャンク列をストリームで書き込むと、連結した内容が往復する", async ({
    expect,
    signal,
    storage,
  }) => {
    await forCasesAsync(61_453, 10, async (random) => {
      // 準備：
      const key = `prop-stream/${random.uint(1_000_000_000)}/${random.string(6)}`;
      const chunks = random.array(random.int(1, 4), () => random.bytes(random.uint(8192)));
      const writer = storage
        .getWritable(createSetContext(key, { signal }) as IStorage.GetWritableContext)
        .getWriter();

      // 実行：
      for (const chunk of chunks) {
        await writer.write(chunk);
      }

      await writer.close();

      // 検証：
      const expected = concatBytes(chunks);
      expect(
        bytesEqual(
          await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
          expected,
        ),
      ).toBe(true);
    });
  });

  test("ランダムなキーを書き込んだ後に clear すると、プレフィックス配下に何も残らない", async ({
    client,
    expect,
    signal,
    storage,
    keyPrefix,
  }) => {
    await forCasesAsync(49_642, 5, async (random) => {
      // 準備：
      const entries = random.array(random.int(1, 10), () => ({
        key: `prop-clear/${random.uint(1_000_000_000)}/${random.string(4)}`,
        data: random.bytes(random.uint(128)),
      }));
      await Promise.all(
        entries.map(({ key, data }) =>
          storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data),
        ),
      );

      // 実行：
      await storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);

      // 検証：
      await expect(listKeys(client, `${keyPrefix}*`)).resolves.toStrictEqual([]);
    });
  });
});
