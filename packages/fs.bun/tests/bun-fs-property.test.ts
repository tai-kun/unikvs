import { isValidFilename } from "@unikvs/utils";
import { describe } from "vitest";

import { bytesEqual, collectBytes, test } from "./_helpers.js";
import { forCasesAsync, type Random } from "./_random.js";

const seed = 20260930;

const VALID_KEY_CHARS = Array.from(
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_日あ📦éΩ",
);

const KEY_POOL = ["alpha.bin", "beta.bin", "gamma.bin", "delta_1.bin"] as const;

type Key = (typeof KEY_POOL)[number];

type Operation =
  | { readonly type: "write"; readonly key: Key; readonly data: Uint8Array<ArrayBuffer> }
  | { readonly type: "delete"; readonly key: Key }
  | { readonly type: "clear" };

/**
 * 検証済みの有効なキーを生成します。
 * 予約名に一致した場合だけ末尾に "-" を足し、必ず有効なキーを返すために使用します。
 */
function generateValidKey(random: Random): string {
  const candidate = random.string(random.int(1, 32), VALID_KEY_CHARS);
  return isValidFilename(candidate) ? candidate : `${candidate}-`;
}

/**
 * write・delete・clear のいずれかの操作を生成します。
 * Map モデルとの状態比較テストでランダムな操作列を組み立てるために使用します。
 */
function generateOperation(random: Random): Operation {
  const kind = random.int(0, 2);

  if (kind === 0) {
    return {
      type: "write",
      key: random.pick(KEY_POOL),
      data: random.bytes(random.int(0, 16)),
    };
  }

  if (kind === 1) {
    return { type: "delete", key: random.pick(KEY_POOL) };
  }

  return { type: "clear" };
}

describe("プロパティベース検証", () => {
  test("任意の有効なキーとバイト列で write→read が往復する", async ({
    expect,
    signal,
    storage,
  }) => {
    await forCasesAsync(seed, 30, async (random) => {
      // 準備
      const key = generateValidKey(random);
      const data = random.bytes(random.int(0, 4096));

      // 実行
      await storage.write({ key, data, signal });
      const result = await storage.read({ key, signal });

      // 検証
      expect(bytesEqual(new Uint8Array(result), data)).toBe(true);
      expect(await storage.exists({ key })).toBe(true);

      // 後始末
      await storage.delete({ key });
      expect(await storage.exists({ key })).toBe(false);
    });
  });

  test("任意のチャンク分割でストリーム書き込みしても通常の read と一致する", async ({
    expect,
    signal,
    storage,
  }) => {
    await forCasesAsync(seed + 1, 30, async (random) => {
      // 準備
      const key = "stream.bin";
      const expected = random.bytes(random.int(0, 2048));
      const sizes = random.array(random.int(0, 24), () => random.int(1, 300));
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      let offset = 0;

      for (const size of sizes) {
        if (offset >= expected.length) break;
        const end = Math.min(offset + size, expected.length);
        chunks.push(expected.subarray(offset, end));
        offset = end;
      }
      if (offset < expected.length) {
        chunks.push(expected.subarray(offset));
      }

      // 実行
      const writer = (await storage.getWritable({ key, signal })).getWriter();
      for (const chunk of chunks) {
        await writer.write(chunk);
      }
      await writer.close();
      const direct = await storage.read({ key, signal });
      const streamed = await collectBytes(storage.getReadable({ key, signal }));

      // 検証
      expect(bytesEqual(new Uint8Array(direct), expected)).toBe(true);
      expect(bytesEqual(streamed, expected)).toBe(true);
    });
  });

  test("ランダムな操作列に対して Map モデルと同じ状態を保つ", async ({
    expect,
    signal,
    storage,
  }) => {
    await forCasesAsync(seed + 2, 30, async (random) => {
      // 準備
      const model = new Map<string, Uint8Array<ArrayBuffer>>();
      const operations = random.array(random.int(0, 20), () => generateOperation(random));
      await storage.clear();

      // 実行
      for (const operation of operations) {
        switch (operation.type) {
          case "write": {
            await storage.write({ key: operation.key, data: operation.data, signal });
            model.set(operation.key, operation.data);
            break;
          }
          case "delete": {
            if (model.has(operation.key)) {
              await storage.delete({ key: operation.key });
              model.delete(operation.key);
            } else {
              await expect(storage.delete({ key: operation.key })).rejects.toThrow(/ENOENT/);
            }
            break;
          }
          case "clear": {
            await storage.clear();
            model.clear();
            break;
          }
        }
      }

      // 検証
      for (const key of KEY_POOL) {
        const data = model.get(key);
        if (data) {
          expect(await storage.exists({ key })).toBe(true);
          expect(bytesEqual(new Uint8Array(await storage.read({ key, signal })), data)).toBe(true);
        } else {
          expect(await storage.exists({ key })).toBe(false);
          await expect(storage.read({ key, signal })).rejects.toThrow(/ENOENT/);
        }
      }
    });
  });
});
