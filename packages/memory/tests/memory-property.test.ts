import { describe, test } from "vitest";

import { KeyNotFoundError } from "../src/errors.js";
import Memory from "../src/memory.js";
import { forCases, forCasesAsync, type Random } from "./_random.js";

const seed = 20260930;

type Value = string | number | boolean | null | readonly number[];

type WriteOperation = {
  readonly type: "write";
  readonly key: string;
  readonly value: Value;
};

type DeleteOperation = {
  readonly type: "delete";
  readonly key: string;
};

type ClearOperation = {
  readonly type: "clear";
};

type Operation = WriteOperation | DeleteOperation | ClearOperation;

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
 */
function nextOperation(random: Random): Operation {
  switch (random.int(0, 2)) {
    case 0: {
      return { type: "write", key: nextKey(random), value: nextValue(random) };
    }
    case 1: {
      return { type: "delete", key: nextKey(random) };
    }
    default: {
      return { type: "clear" };
    }
  }
}

describe("Memory のプロパティー", () => {
  test("ランダムな操作列に対して Map と同じ状態を保つ", ({ expect }) => {
    forCases(seed, 100, (random) => {
      // 準備
      const storage = new Memory();
      const model = new Map<string, Value>();
      const operations = random.array(random.int(0, 30), () => nextOperation(random));

      // 実行
      for (const operation of operations) {
        switch (operation.type) {
          case "write": {
            storage.write({ vars: {}, key: operation.key, data: operation.value });
            model.set(operation.key, operation.value);
            break;
          }
          case "delete": {
            if (model.has(operation.key)) {
              storage.delete({ key: operation.key });
              model.delete(operation.key);
            } else {
              expect(() => storage.delete({ key: operation.key })).toThrow(KeyNotFoundError);
            }
            break;
          }
          case "clear": {
            storage.clear();
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
          expect(storage.exists({ key })).toBe(true);
          expect(storage.read({ key })).toStrictEqual(model.get(key));
        } else {
          expect(storage.exists({ key })).toBe(false);
          expect(() => storage.read({ key })).toThrow(KeyNotFoundError);
        }
      }
    });
  });

  test("ランダムなバイト列を byte-for-byte で往復できる", ({ expect }) => {
    forCases(seed + 1, 100, (random) => {
      // 準備
      const storage = new Memory();
      const bytes = random.bytes(random.int(0, 512));

      // 実行
      storage.write({ vars: {}, key: "k1", data: bytes });
      const result = storage.read({ key: "k1" }) as Uint8Array;

      // 検証
      expect(result).toStrictEqual(bytes);
      expect(result).not.toBe(bytes);
    });
  });

  test("ランダムなチャンク列をストリームで書いたとき、通常の read と一致する", async ({
    expect,
  }) => {
    await forCasesAsync(seed + 2, 50, async (random) => {
      // 準備
      const storage = new Memory();
      const chunks = random.array(random.int(0, 8), () => random.bytes(random.int(0, 64)));
      const writer = storage.getWritable({ vars: {}, key: "k1" }).getWriter();

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
      expect(storage.read({ key: "k1" })).toStrictEqual(expected);
    });
  });
});
