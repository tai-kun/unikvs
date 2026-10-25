import type { IStorage } from "@unikvs/core";
import {
  captureThrown,
  createGetContext,
  createHasContext,
  createSetContext,
  createOpenContext,
} from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

import LruCache from "../src/lru-cache.js";

describe("clone オプション", () => {
  test("clone を省略したとき、structuredClone で複製される", async ({ expect, signal }) => {
    // 準備：
    const storage = new LruCache();
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    const source = { nested: { value: 1 } };

    // 実行：
    storage.write(createSetContext("k1") as IStorage.WriteContext, source);
    source.nested.value = 99;

    // 検証：
    expect(storage.read(createGetContext("k1") as IStorage.ReadContext)).toStrictEqual({
      nested: { value: 1 },
    });
  });

  test("clone に undefined を明示しても structuredClone で複製される", async ({
    expect,
    signal,
  }) => {
    // 準備：
    const storage = new LruCache({ clone: undefined });
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    const source = new Uint8Array([1, 2, 3]);

    // 実行：
    storage.write(createSetContext("k1") as IStorage.WriteContext, source);
    source[0] = 99;

    // 検証：
    expect(storage.read(createGetContext("k1") as IStorage.ReadContext)).toStrictEqual(
      new Uint8Array([1, 2, 3]),
    );
  });

  test("clone は書き込み時と読み取り時に呼ばれる", async ({ expect, signal }) => {
    // 準備：
    const calls: unknown[] = [];
    const storage = new LruCache({
      clone: <T>(value: T): T => {
        calls.push(value);

        return structuredClone(value);
      },
    });
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行：
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    storage.read(createGetContext("k1") as IStorage.ReadContext);

    // 検証：
    expect(calls).toStrictEqual(["v1", "v1"]);
  });

  test("clone の戻り値が保存される", async ({ expect, signal }) => {
    // 準備：
    const storage = new LruCache({
      // oxlint-disable-next-line unicorn/prefer-structured-clone
      clone: <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T,
    });
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行：
    storage.write(
      createSetContext("k1") as IStorage.WriteContext,
      new Date("2024-01-02T03:04:05.678Z"),
    );

    // 検証：
    expect(storage.read(createGetContext("k1") as IStorage.ReadContext)).toBe(
      "2024-01-02T03:04:05.678Z",
    );
  });

  test("clone が書き込み時に投げたとき、値は保存されない", async ({ expect, signal }) => {
    // 準備：
    const storage = new LruCache({
      clone: <T>(_value: T): T => {
        throw new Error("clone failed");
      },
    });
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行：
    const error = captureThrown(() => {
      storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    });

    // 検証：
    expect((error as Error).message).toBe("clone failed");

    expect(storage.exists(createHasContext("k1") as IStorage.ExistsContext)).toBe(false);
  });

  test("clone が読み取り時に投げたとき、そのエラーが伝播する", async ({ expect, signal }) => {
    // 準備：
    let calls = 0;
    const storage = new LruCache({
      clone: <T>(value: T): T => {
        calls += 1;
        // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
        if (calls === 2) {
          throw new Error("clone failed");
        }

        return structuredClone(value);
      },
    });
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");

    // 実行：
    const error = captureThrown(() => storage.read(createGetContext("k1") as IStorage.ReadContext));

    // 検証：
    expect((error as Error).message).toBe("clone failed");

    expect(storage.exists(createHasContext("k1") as IStorage.ExistsContext)).toBe(true);
  });

  test("ArrayBuffer のビューを保存したとき、ビューの範囲だけが複製される", async ({
    expect,
    signal,
  }) => {
    // 準備：
    const storage = new LruCache();
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    const buffer = new Uint8Array([0, 1, 2, 3]).buffer;
    const view = new Uint8Array(buffer, 1, 2);

    // 実行：
    storage.write(createSetContext("k1") as IStorage.WriteContext, view);

    // 検証：
    expect(storage.read(createGetContext("k1") as IStorage.ReadContext)).toStrictEqual(
      new Uint8Array([1, 2]),
    );
  });
});
