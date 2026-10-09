import { describe, test } from "vitest";

import { KeyNotFoundError } from "../src/errors.js";
import LocalStorage from "../src/localstorage.js";
import { createFakeStorage } from "./_helpers.js";
import { forCases, type Random } from "./_random.js";

const { signal } = new AbortController();

const seed = 20260930;

type WriteOperation = {
  readonly type: "write";
  readonly key: string;
  readonly value: string;
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

const constantValues = ["", " ", "s:foo", "b:aGk=", "j:{}", "あ", "🎉", "v"];

/**
 * モデル比較用のランダムなキーを返します。
 * 特殊なキーとランダム文字列を混ぜ、衝突と境界値の両方を検証できるようにします。
 */
function nextKey(random: Random): string {
  return random.bool() ? random.pick(constantKeys) : random.string(random.int(0, 8));
}

/**
 * ランダムな文字列値を返します。
 * 空文字・目印接頭辞・Unicode を混ぜ、素通し保存を検証できるようにします。
 */
function nextValue(random: Random): string {
  return random.bool() ? random.pick(constantValues) : random.string(random.int(0, 32));
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

describe("LocalStorage のプロパティー", () => {
  test("ランダムな操作列に対して Map と同じ状態を保つ", ({ expect }) => {
    forCases(seed, 100, (random) => {
      // 準備
      const storage = new LocalStorage({ storage: createFakeStorage() });
      const model = new Map<string, string>();
      const operations = random.array(random.int(0, 30), () => nextOperation(random));

      // 実行
      for (const operation of operations) {
        switch (operation.type) {
          case "write": {
            storage.write({ key: operation.key, data: operation.value, vars: {}, signal });
            model.set(operation.key, operation.value);
            break;
          }
          case "delete": {
            if (model.has(operation.key)) {
              storage.delete({ key: operation.key, signal });
              model.delete(operation.key);
            } else {
              expect(() => storage.delete({ key: operation.key, signal })).toThrow(
                KeyNotFoundError,
              );
            }
            break;
          }
          case "clear": {
            storage.clear({ signal });
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
          expect(storage.exists({ key, signal })).toBe(true);
          expect(storage.read({ key, signal })).toBe(model.get(key));
        } else {
          expect(storage.exists({ key, signal })).toBe(false);
          expect(() => storage.read({ key, signal })).toThrow(KeyNotFoundError);
        }
      }
    });
  });

  test("ランダムな文字列を byte-for-byte で往復できる", ({ expect }) => {
    forCases(seed + 1, 100, (random) => {
      // 準備
      const storage = new LocalStorage({ storage: createFakeStorage() });
      const value = nextValue(random) + random.string(random.int(0, 512));

      // 実行
      storage.write({ key: "k1", data: value, vars: {}, signal });
      const result = storage.read({ key: "k1", signal });

      // 検証
      expect(result).toBe(value);
    });
  });

  test("ランダムな書込後の clear は全キーを消去する", ({ expect }) => {
    forCases(seed + 2, 50, (random) => {
      // 準備
      const backend = createFakeStorage();
      const storage = new LocalStorage({ storage: backend });
      const keys = random.array(random.int(1, 10), () => nextKey(random));

      // 実行
      for (const key of keys) {
        storage.write({ key, data: nextValue(random), vars: {}, signal });
      }
      storage.clear({ signal });

      // 検証
      expect(backend.length).toBe(0);
      for (const key of keys) {
        expect(storage.exists({ key, signal })).toBe(false);
      }
    });
  });
});
