import type { IStorage } from "@unikvs/core";
import {
  type Random,
  forCases,
  createGetContext,
  createHasContext,
  createSetContext,
  createClearContext,
  createDeleteContext,
} from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

import { KeyNotFoundError } from "../src/errors.js";
import LocalStorage from "../src/localstorage.js";
import { createFakeStorage } from "./_helpers.js";

const { signal } = new AbortController();

const seed = 20_260_930;

type WriteOperation = {
  readonly key: string;
  readonly type: "write";
  readonly value: string;
};

type DeleteOperation = {
  readonly key: string;
  readonly type: "delete";
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
      return {
        key: nextKey(random),
        type: "write",
        value: nextValue(random),
      };
    }

    case 1: {
      return {
        key: nextKey(random),
        type: "delete",
      };
    }

    default: {
      return { type: "clear" };
    }
  }
}

describe("LocalStorage のプロパティー", () => {
  test("ランダムな操作列に対して Map と同じ状態を保つ", ({ expect }) => {
    forCases(seed, 100, (random) => {
      // 準備：
      const storage = new LocalStorage({ storage: createFakeStorage() });
      const model = new Map<string, string>();
      const operations = random.array(random.int(0, 30), () => nextOperation(random));

      // 実行：
      for (const operation of operations) {
        // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
        switch (operation.type) {
          case "write": {
            storage.write(
              createSetContext(operation.key, { signal }) as IStorage.WriteContext,
              operation.value,
            );
            model.set(operation.key, operation.value);
            break;
          }

          case "delete": {
            // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
            if (model.has(operation.key)) {
              storage.delete(
                createDeleteContext(operation.key, { signal }) as IStorage.DeleteContext,
              );
              model.delete(operation.key);
            } else {
              expect(() => {
                storage.delete(
                  createDeleteContext(operation.key, { signal }) as IStorage.DeleteContext,
                );
              }).toThrow(KeyNotFoundError);
            }

            break;
          }

          case "clear": {
            storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);
            model.clear();
            break;
          }
        }
      }

      // 検証：
      const touchedKeys = new Set<string>();

      for (const operation of operations) {
        // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
        if (operation.type !== "clear") {
          touchedKeys.add(operation.key);
        }
      }

      for (const key of touchedKeys) {
        // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
        if (model.has(key)) {
          expect(storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext)).toBe(
            true,
          );
          expect(storage.read(createGetContext(key, { signal }) as IStorage.ReadContext)).toBe(
            model.get(key),
          );
        } else {
          expect(storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext)).toBe(
            false,
          );
          expect(() =>
            storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
          ).toThrow(KeyNotFoundError);
        }
      }
    });
  });

  test("ランダムな文字列を byte-for-byte で往復できる", ({ expect }) => {
    forCases(seed + 1, 100, (random) => {
      // 準備：
      const storage = new LocalStorage({ storage: createFakeStorage() });
      const value = nextValue(random) + random.string(random.int(0, 512));

      // 実行：
      storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, value);

      const result = storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext);

      // 検証：
      expect(result).toBe(value);
    });
  });

  test("ランダムな書込後の clear は全キーを消去する", ({ expect }) => {
    forCases(seed + 2, 50, (random) => {
      // 準備：
      const backend = createFakeStorage();
      const storage = new LocalStorage({ storage: backend });
      const keys = random.array(random.int(1, 10), () => nextKey(random));

      // 実行：
      for (const key of keys) {
        storage.write(
          createSetContext(key, { signal }) as IStorage.WriteContext,
          nextValue(random),
        );
      }

      storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);

      // 検証：
      expect(backend.length).toBe(0);
      for (const key of keys) {
        expect(storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext)).toBe(
          false,
        );
      }
    });
  });
});
