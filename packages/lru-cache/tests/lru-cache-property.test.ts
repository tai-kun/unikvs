import type { IStorage } from "@unikvs/core";
import {
  forCasesAsync,
  createDeleteContext,
  createGetContext,
  createHasContext,
  createOpenContext,
  createSetContext,
  type Random,
  createClearContext,
} from "@unikvs/testing";
import { describe, test } from "vitest";

import { KeyNotFoundError } from "../src/errors.js";
import LruCache from "../src/lru-cache.js";

const seed = 20260930;
const maxEntries = 3;

type Value = string | number | boolean | null | readonly number[];

type WriteOperation = {
  readonly type: "write";
  readonly key: string;
  readonly value: Value;
};

type ReadOperation = {
  readonly type: "read";
  readonly key: string;
};

type DeleteOperation = {
  readonly type: "delete";
  readonly key: string;
};

type ClearOperation = {
  readonly type: "clear";
};

type Operation = WriteOperation | ReadOperation | DeleteOperation | ClearOperation;

const constantKeys = ["", "a", "key", "key/1", "🔑", "__proto__", "constructor"];

/**
 * モデル比較用のランダムなキーを返します。
 * 特殊なキーとランダム文字列を混ぜ、衝突と境界値の両方を検証できるようにします。
 */
function nextKey(random: Random): string {
  return random.bool() ? random.pick(constantKeys) : random.string(random.int(0, 8));
}

/**
 * structuredClone で複製できる範囲のランダムな値を返します。
 */
function nextValue(random: Random): Value {
  switch (random.int(0, 4)) {
    case 0: {
      return random.string(random.int(0, 8));
    }
    case 1: {
      return random.int(-1000, 1000);
    }
    case 2: {
      return random.bool();
    }
    case 3: {
      return null;
    }
    default: {
      return random.array(random.int(0, 4), () => random.int(-100, 100));
    }
  }
}

/**
 * Map モデルとの比較に使うランダムな操作を返します。
 * read を含め、LRU 順序の更新も検証できるようにします。
 */
function nextOperation(random: Random): Operation {
  switch (random.int(0, 3)) {
    case 0: {
      return { type: "write", key: nextKey(random), value: nextValue(random) };
    }
    case 1: {
      return { type: "read", key: nextKey(random) };
    }
    case 2: {
      return { type: "delete", key: nextKey(random) };
    }
    default: {
      return { type: "clear" };
    }
  }
}

/**
 * 検証用の素朴な LRU モデルです。
 * Map の挿入順を直近使用順として使い、件数上限を超えたら先頭から追い出します。
 * 本番の evictIfNeeded と同じ規則を独立に記述し、操作列の一致を検証するために使用します。
 */
class ReferenceLru {
  private readonly map = new Map<string, Value>();
  private readonly limit: number;

  public constructor(limit: number) {
    this.limit = limit;
  }

  public write(key: string, value: Value): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    }

    this.map.set(key, value);

    if (this.limit === 0) {
      this.map.delete(key);
      return;
    }

    while (this.map.size > this.limit) {
      const oldest = this.map.keys().next().value as string;

      this.map.delete(oldest);
    }
  }

  public read(key: string): Value {
    const value = this.map.get(key);

    if (value === undefined && !this.map.has(key)) {
      throw new KeyNotFoundError({ key });
    }

    this.map.delete(key);
    this.map.set(key, value as Value);

    return value as Value;
  }

  public delete(key: string): void {
    if (!this.map.has(key)) {
      throw new KeyNotFoundError({ key });
    }

    this.map.delete(key);
  }

  public clear(): void {
    this.map.clear();
  }

  public has(key: string): boolean {
    return this.map.has(key);
  }

  public get(key: string): Value | undefined {
    return this.map.get(key);
  }
}

describe("LruCache のプロパティー", () => {
  test("ランダムな操作列に対して参照 LRU モデルと同じ状態を保つ", async ({ expect, signal }) => {
    await forCasesAsync(seed, 100, async (random) => {
      // 準備
      const storage = new LruCache({ maxEntries });
      await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
      const model = new ReferenceLru(maxEntries);
      const operations = random.array(random.int(0, 30), () => nextOperation(random));

      // 実行
      for (const operation of operations) {
        switch (operation.type) {
          case "write": {
            storage.write(
              createSetContext(operation.key) as IStorage.WriteContext,
              operation.value,
            );
            model.write(operation.key, operation.value);
            break;
          }
          case "read": {
            if (model.has(operation.key)) {
              expect(
                storage.read(createGetContext(operation.key) as IStorage.ReadContext),
              ).toStrictEqual(model.read(operation.key));
            } else {
              expect(() =>
                storage.read(createGetContext(operation.key) as IStorage.ReadContext),
              ).toThrow(KeyNotFoundError);
            }
            break;
          }
          case "delete": {
            if (model.has(operation.key)) {
              storage.delete(createDeleteContext(operation.key) as IStorage.DeleteContext);
              model.delete(operation.key);
            } else {
              expect(() =>
                storage.delete(createDeleteContext(operation.key) as IStorage.DeleteContext),
              ).toThrow(KeyNotFoundError);
            }
            break;
          }
          case "clear": {
            storage.clear(createClearContext() as IStorage.ClearContext);
            model.clear();
            break;
          }
        }
      }

      // 検証
      const touchedKeys = new Set<string>();
      for (const operation of operations) {
        if (operation.type !== "clear") {
          touchedKeys.add(operation.key);
        }
      }
      for (const key of touchedKeys) {
        if (model.has(key)) {
          expect(storage.exists(createHasContext(key) as IStorage.ExistsContext)).toBe(true);
          expect(storage.read(createGetContext(key) as IStorage.ReadContext)).toStrictEqual(
            model.get(key),
          );
        } else {
          expect(storage.exists(createHasContext(key) as IStorage.ExistsContext)).toBe(false);
          expect(() => storage.read(createGetContext(key) as IStorage.ReadContext)).toThrow(
            KeyNotFoundError,
          );
        }
      }
      expect(storage.size).toBe([...touchedKeys].filter((key) => model.has(key)).length);
    });
  });

  test("ランダムなバイト列を byte-for-byte で往復できる", async ({ expect, signal }) => {
    await forCasesAsync(seed + 1, 100, async (random) => {
      // 準備
      const storage = new LruCache();
      await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
      const bytes = random.bytes(random.int(0, 512));

      // 実行
      storage.write(createSetContext("k1") as IStorage.WriteContext, bytes);
      const result = storage.read(createGetContext("k1") as IStorage.ReadContext) as Uint8Array;

      // 検証
      expect(result).toStrictEqual(bytes);
      expect(result).not.toBe(bytes);
    });
  });

  test("ランダムなチャンク列をストリームで書いたとき、通常の read と一致する", async ({
    expect,
    signal,
  }) => {
    await forCasesAsync(seed + 2, 50, async (random) => {
      // 準備
      const storage = new LruCache();
      await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
      const chunks = random.array(random.int(0, 8), () => random.bytes(random.int(0, 64)));
      const writer = storage
        .getWritable(createSetContext("k1") as IStorage.GetWritableContext)
        .getWriter();

      // 実行
      for (const chunk of chunks) {
        await writer.write(chunk);
      }
      await writer.close();

      // 検証
      const expected = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
      let offset = 0;
      for (const chunk of chunks) {
        expected.set(chunk, offset);
        offset += chunk.byteLength;
      }
      expect(storage.read(createGetContext("k1") as IStorage.ReadContext)).toStrictEqual(expected);
    });
  });
});
