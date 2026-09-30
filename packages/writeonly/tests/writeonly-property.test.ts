import { describe, test } from "vitest";

import Memory from "../../memory/src/memory.js";
import { KeyNotFoundError } from "../src/errors.js";
import WriteOnly from "../src/write-only.js";
import { forCasesAsync, type Random } from "./_random.js";

const seed = 20260930;

const signal = new AbortController().signal;

const vars = {};

type Value = string | number | boolean | null | readonly number[] | Uint8Array;

const specialKeys = ["", "a", "key", "key/1", "🔑", "__proto__", "constructor"] as const;

/**
 * 特殊なキーとランダムな文字列を混ぜたキーを生成します。
 * 空文字やプロトタイプ由来の名前を含む任意のキーで委譲が壊れないことを検証するために使用します。
 */
function generateKey(random: Random): string {
  return random.bool() ? random.pick(specialKeys) : random.string(random.int(0, 8));
}

/**
 * 文字列・数値・真偽値・null・数値配列・バイト列を混ぜた値を生成します。
 * 任意の型の値が内部ストレージへそのまま委譲されることを検証するために使用します。
 */
function generateValue(random: Random): Value {
  switch (random.int(0, 5)) {
    case 0: {
      return random.string(random.int(0, 16));
    }
    case 1: {
      return random.int(-2147483648, 2147483647);
    }
    case 2: {
      return random.bool();
    }
    case 3: {
      return null;
    }
    case 4: {
      return random.array(random.int(0, 4), () => random.int(-2147483648, 2147483647));
    }
    default: {
      return random.bytes(random.int(0, 16));
    }
  }
}

type Operation =
  | { readonly type: "write"; readonly key: string; readonly value: Value }
  | { readonly type: "delete"; readonly key: string }
  | { readonly type: "clear" };

/**
 * write・delete・clear のいずれかの操作を生成します。
 * allowDelete が false のときでも任意の操作列で状態が変わらないことを検証するために使用します。
 */
function generateOperation(random: Random): Operation {
  switch (random.int(0, 2)) {
    case 0: {
      return { type: "write", key: generateKey(random), value: generateValue(random) };
    }
    case 1: {
      return { type: "delete", key: generateKey(random) };
    }
    default: {
      return { type: "clear" };
    }
  }
}

describe("WriteOnly のプロパティー", () => {
  test("任意のキーと値の write は内部ストレージから直接読み出せる", async ({ expect }) => {
    await forCasesAsync(seed, 100, async (random) => {
      // 準備
      const key = generateKey(random);
      const value = generateValue(random);
      const inner = new Memory();
      const storage = new WriteOnly(inner);

      // 実行
      await storage.write({ key, data: value, vars, signal });

      // 検証
      expect(inner.exists({ key })).toBe(true);
      expect(inner.read({ key })).toStrictEqual(value);
      expect(storage.exists({ key })).toBe(false);
      expect(() => storage.read({ key })).toThrow(KeyNotFoundError);
    });
  });

  test("exists は書き込みの有無やキーによらず常に false を返す", async ({ expect }) => {
    await forCasesAsync(seed + 1, 50, async (random) => {
      // 準備
      const entries = random.array(random.int(0, 10), () => ({
        key: generateKey(random),
        value: generateValue(random),
      }));
      const key = generateKey(random);
      const inner = new Memory();
      const storage = new WriteOnly(inner);

      // 実行
      for (const entry of entries) {
        await storage.write({ key: entry.key, data: entry.value, vars, signal });
      }
      const result = storage.exists({ key });

      // 検証
      expect(inner.exists({ key })).toBe(entries.some((entry) => entry.key === key));
      expect(result).toBe(false);
    });
  });

  test("allowDelete が false のとき、任意の delete と clear は内部の状態を変えない", async ({
    expect,
  }) => {
    await forCasesAsync(seed + 2, 50, async (random) => {
      // 準備
      const operations = random.array(random.int(0, 20), () => generateOperation(random));
      const inner = new Memory();
      const storage = new WriteOnly(inner);
      const model = new Map<string, Value>();

      // 実行
      for (const operation of operations) {
        switch (operation.type) {
          case "write": {
            await storage.write({ key: operation.key, data: operation.value, vars, signal });
            model.set(operation.key, operation.value);
            break;
          }
          case "delete": {
            await storage.delete({ key: operation.key, vars, signal });
            break;
          }
          case "clear": {
            await storage.clear({ vars, signal });
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
          expect(inner.exists({ key })).toBe(true);
          expect(inner.read({ key })).toStrictEqual(model.get(key));
        } else {
          expect(inner.exists({ key })).toBe(false);
        }
      }
    });
  });

  test("getWritable で任意のチャンク列を書くと内部に連結されて保存される", async ({ expect }) => {
    await forCasesAsync(seed + 3, 50, async (random) => {
      // 準備
      const chunks = random.array(random.int(0, 8), () => random.bytes(random.int(0, 64)));
      const inner = new Memory();
      const storage = new WriteOnly(inner);
      const writable = storage.getWritable;
      if (!writable) {
        throw new Error("getWritable が公開されていません");
      }
      const writer = (await writable({ key: "s1", vars, signal })).getWriter();

      // 実行
      for (const chunk of chunks) {
        await writer.write(chunk);
      }
      await writer.close();

      // 検証
      const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
      const expected = new Uint8Array(totalLength);
      let offset = 0;

      for (const chunk of chunks) {
        expected.set(chunk, offset);
        offset += chunk.byteLength;
      }

      expect(inner.read({ key: "s1" })).toStrictEqual(expected);
    });
  });
});
