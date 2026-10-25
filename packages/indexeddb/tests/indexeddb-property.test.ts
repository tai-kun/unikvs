import type { IStorage } from "@unikvs/core";
import {
  type Random,
  concatChunks,
  forCasesAsync,
  createGetContext,
  createHasContext,
  createSetContext,
  createOpenContext,
  createClearContext,
  createDeleteContext,
} from "@unikvs/testing";
import { describe } from "vite-plus/test";

import { test } from "./_helpers.js";

const { signal } = new AbortController();

const seed = 20_260_930;
const caseCount = 30;

type Value = string | number | boolean | null | readonly number[];

type WriteOperation = {
  readonly key: string;
  readonly type: "write";
  readonly value: Value;
};

type DeleteOperation = {
  readonly key: string;
  readonly type: "delete";
};

type ClearOperation = {
  readonly type: "clear";
};

type Operation = WriteOperation | DeleteOperation | ClearOperation;

const SPECIAL_KEYS = ["", "a", "key", "key/1", "🔑", "__proto__", "constructor"] as const;

/**
 * 特殊なキーとランダムな文字列を混ぜたキーを生成します。
 * キーの境界値と任意文字列の両方で往復を検証するために使用します。
 */
function randomKey(random: Random): string {
  return random.bool() ? random.pick(SPECIAL_KEYS) : random.string(random.uint(9));
}

/**
 * structured clone 可能な値の種類をランダムに選んで生成します。
 * 値の型ごとの write→read 往復を検証するために使用します。
 */
function randomValue(random: Random): Value {
  switch (random.int(0, 4)) {
    case 0: {
      return random.string(random.uint(11));
    }

    case 1: {
      return random.int(-2_147_483_648, 2_147_483_647);
    }

    case 2: {
      return random.bool();
    }

    case 3: {
      return null;
    }

    default: {
      return random.array(random.uint(5), () => random.int(-1_000_000, 1_000_000));
    }
  }
}

/**
 * write・delete・clear のいずれかの操作をランダムに生成します。
 * ランダムな操作列と Map モデルの状態比較に使用します。
 */
function randomOperation(random: Random): Operation {
  switch (random.int(0, 2)) {
    case 0: {
      return {
        key: randomKey(random),
        type: "write",
        value: randomValue(random),
      };
    }

    case 1: {
      return {
        key: randomKey(random),
        type: "delete",
      };
    }

    default: {
      return { type: "clear" };
    }
  }
}

describe("Indexeddb のプロパティー", () => {
  test("任意のキーと structured clone 可能な値の write→read 往復", async ({ expect, storage }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行と検証：
    await forCasesAsync(seed, caseCount, async (random) => {
      const key = randomKey(random);
      const value = randomValue(random);
      await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, value);
      expect(
        await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
      ).toStrictEqual(value);
    });
  });

  test("任意のバイト列を byte-for-byte で往復できる", async ({ expect, storage }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行と検証：
    await forCasesAsync(seed + 1, caseCount, async (random) => {
      const bytes = random.bytes(random.uint(257));
      await storage.write(createSetContext("bytes", { signal }) as IStorage.WriteContext, bytes);

      const result = await storage.read(
        createGetContext("bytes", { signal }) as IStorage.ReadContext,
      );
      expect(result).toStrictEqual(bytes);
      expect(result).not.toBe(bytes);
    });
  });

  test("ランダムな操作列に対して Map と同じ状態を保つ", async ({ expect, storage }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行と検証：
    await forCasesAsync(seed + 2, caseCount, async (random) => {
      const operations = random.array(random.uint(21), () => randomOperation(random));

      await storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);
      const model = new Map<string, Value>();

      for (const operation of operations) {
        // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
        switch (operation.type) {
          case "write": {
            await storage.write(
              createSetContext(operation.key, { signal }) as IStorage.WriteContext,
              operation.value,
            );
            model.set(operation.key, operation.value);
            break;
          }

          case "delete": {
            await storage.delete(
              createDeleteContext(operation.key, { signal }) as IStorage.DeleteContext,
            );
            model.delete(operation.key);
            break;
          }

          case "clear": {
            await storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);
            model.clear();
            break;
          }
        }
      }

      const touchedKeys = new Set<string>();

      for (const operation of operations) {
        // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
        if (operation.type !== "clear") {
          touchedKeys.add(operation.key);
        }
      }

      for (const key of touchedKeys) {
        expect(
          await storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext),
        ).toBe(model.has(key));

        // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
        if (model.has(key)) {
          expect(
            await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
          ).toStrictEqual(model.get(key));
        }
      }
    });
  });

  test("任意のチャンク列をストリームで書いたとき、連結した値になる", async ({
    expect,
    storage,
  }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行と検証：
    await forCasesAsync(seed + 3, caseCount, async (random) => {
      const chunks = random.array(random.uint(9), () => random.bytes(random.uint(65)));
      const writer = storage
        .getWritable(createSetContext("stream", { signal }) as IStorage.GetWritableContext)
        .getWriter();

      for (const chunk of chunks) {
        await writer.write(chunk);
      }

      await writer.close();

      expect(
        await storage.read(createGetContext("stream", { signal }) as IStorage.ReadContext),
      ).toStrictEqual(concatChunks(chunks));
    });
  });
});
