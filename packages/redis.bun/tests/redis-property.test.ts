import { describe } from "vitest";

import { bytesEqual, concatBytes, listKeys, test } from "./_helpers.js";
import { forCasesAsync } from "./_random.js";

describe("プロパティーベースの検証", () => {
  test("ランダムなキーとデータの CRUD が往復する", async ({ expect, signal, storage }) => {
    await forCasesAsync(0x5eed, 20, async (random) => {
      // 準備
      const key = `prop/${random.uint(1_000_000_000)}/${random.string(6)}`;
      const data = random.bytes(random.uint(4096));

      // 実行
      await storage.write({ key, data, signal });

      // 検証
      await expect(storage.exists({ key, signal })).resolves.toBe(true);
      expect(bytesEqual(await storage.read({ key, signal }), data)).toBe(true);

      // 実行
      const next = random.bytes(random.uint(4096));
      await storage.write({ key, data: next, signal });

      // 検証
      expect(bytesEqual(await storage.read({ key, signal }), next)).toBe(true);

      // 実行
      await storage.delete({ key, signal });

      // 検証
      await expect(storage.exists({ key, signal })).resolves.toBe(false);
    });
  });

  test("ランダムなチャンク列をストリームで書き込むと、連結した内容が往復する", async ({
    expect,
    signal,
    storage,
  }) => {
    await forCasesAsync(0xf00d, 10, async (random) => {
      // 準備
      const key = `prop-stream/${random.uint(1_000_000_000)}/${random.string(6)}`;
      const chunks = random.array(random.int(1, 4), () => random.bytes(random.uint(8192)));
      const writer = storage.getWritable({ key, signal }).getWriter();

      // 実行
      for (const chunk of chunks) {
        await writer.write(chunk);
      }
      await writer.close();

      // 検証
      const expected = concatBytes(chunks);
      expect(bytesEqual(await storage.read({ key, signal }), expected)).toBe(true);
    });
  });

  test("ランダムなキーを書き込んだ後に clear すると、プレフィックス配下に何も残らない", async ({
    client,
    expect,
    keyPrefix,
    signal,
    storage,
  }) => {
    await forCasesAsync(0xc1ea, 5, async (random) => {
      // 準備
      const entries = random.array(random.int(1, 10), () => ({
        key: `prop-clear/${random.uint(1_000_000_000)}/${random.string(4)}`,
        data: random.bytes(random.uint(128)),
      }));
      await Promise.all(entries.map(({ key, data }) => storage.write({ key, data, signal })));

      // 実行
      await storage.clear({ signal });

      // 検証
      await expect(listKeys(client, `${keyPrefix}*`)).resolves.toStrictEqual([]);
    });
  });
});
