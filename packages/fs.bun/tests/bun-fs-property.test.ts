import type { IStorage } from "@unikvs/core";
import {
  type Random,
  bytesEqual,
  collectBytes,
  splitBySizes,
  forCasesAsync,
  createGetContext,
  createHasContext,
  createSetContext,
  createClearContext,
  createDeleteContext,
  createStreamContext,
} from "@unikvs/testing";
import { isValidFilename } from "@unikvs/utils";
import { describe } from "vite-plus/test";

import { test } from "./_helpers.js";

const seed = 20_260_930;

const VALID_KEY_CHARS = Array.from(
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_日あ📦éΩ",
);

const KEY_POOL = ["alpha.bin", "beta.bin", "gamma.bin", "delta_1.bin"] as const;

type Key = (typeof KEY_POOL)[number];

type Operation =
  | {
      readonly key: Key;
      readonly data: Uint8Array<ArrayBuffer>;
      readonly type: "write";
    }
  | {
      readonly key: Key;
      readonly type: "delete";
    }
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
      key: random.pick(KEY_POOL),
      data: random.bytes(random.int(0, 16)),
      type: "write",
    };
  }

  if (kind === 1) {
    return {
      key: random.pick(KEY_POOL),
      type: "delete",
    };
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
      // 準備：
      const key = generateValidKey(random);
      const data = random.bytes(random.int(0, 4096));

      // 実行：
      await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);

      const result = await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);

      // 検証：
      expect(bytesEqual(new Uint8Array(result), data)).toBe(true);

      expect(await storage.exists(createHasContext(key) as IStorage.ExistsContext)).toBe(true);

      // 後始末：
      await storage.delete(createDeleteContext(key) as IStorage.DeleteContext);
      expect(await storage.exists(createHasContext(key) as IStorage.ExistsContext)).toBe(false);
    });
  });

  test("任意のチャンク分割でストリーム書き込みしても通常の read と一致する", async ({
    expect,
    signal,
    storage,
  }) => {
    await forCasesAsync(seed + 1, 30, async (random) => {
      // 準備：
      const key = "stream.bin";
      const expected = random.bytes(random.int(0, 2048));
      const sizes = random.array(random.int(0, 24), () => random.int(1, 300));
      const chunks = splitBySizes(expected, sizes);

      // 実行：
      const writer = storage
        .getWritable(createSetContext(key, { signal }) as IStorage.GetWritableContext)
        .getWriter();

      for (const chunk of chunks) {
        await writer.write(chunk);
      }

      await writer.close();
      const direct = await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);
      const streamed = await collectBytes(
        storage.getReadable(createStreamContext(key, { signal }) as IStorage.GetReadableContext),
      );

      // 検証：
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
      // 準備：
      const model = new Map<string, Uint8Array<ArrayBuffer>>();
      const operations = random.array(random.int(0, 20), () => generateOperation(random));

      await storage.clear(createClearContext() as IStorage.ClearContext);

      // 実行：
      for (const operation of operations) {
        // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
        switch (operation.type) {
          case "write": {
            await storage.write(
              createSetContext(operation.key, { signal }) as IStorage.WriteContext,
              operation.data,
            );
            model.set(operation.key, operation.data);
            break;
          }

          case "delete": {
            // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
            if (model.has(operation.key)) {
              await storage.delete(createDeleteContext(operation.key) as IStorage.DeleteContext);
              model.delete(operation.key);
            } else {
              await expect(
                storage.delete(createDeleteContext(operation.key) as IStorage.DeleteContext),
              ).rejects.toThrow(/ENOENT/u);
            }

            break;
          }

          case "clear": {
            await storage.clear(createClearContext() as IStorage.ClearContext);
            model.clear();
            break;
          }
        }
      }

      // 検証：
      for (const key of KEY_POOL) {
        const data = model.get(key);

        // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
        if (data !== undefined) {
          expect(await storage.exists(createHasContext(key) as IStorage.ExistsContext)).toBe(true);
          expect(
            bytesEqual(
              new Uint8Array(
                await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
              ),
              data,
            ),
          ).toBe(true);
        } else {
          expect(await storage.exists(createHasContext(key) as IStorage.ExistsContext)).toBe(false);
          await expect(
            storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
          ).rejects.toThrow(/ENOENT/u);
        }
      }
    });
  });
});
