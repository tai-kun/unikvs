import type { IStorage } from "@unikvs/core";
import {
  captureThrown,
  createGetContext,
  createHasContext,
  createSetContext,
} from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

import Memory from "../src/memory.js";

describe("clone オプション", () => {
  test("clone を省略したとき、structuredClone で複製される", ({ expect }) => {
    // 準備：
    const storage = new Memory();
    const source = { nested: { value: 1 } };

    // 実行：
    storage.write(createSetContext("k1") as IStorage.WriteContext, source);
    source.nested.value = 99;

    // 検証：
    expect(storage.read(createGetContext("k1") as IStorage.ReadContext)).toStrictEqual({
      nested: { value: 1 },
    });
  });

  test("clone に undefined を明示しても structuredClone で複製される", ({ expect }) => {
    // 準備：
    const storage = new Memory({ clone: undefined });
    const source = new Uint8Array([1, 2, 3]);

    // 実行：
    storage.write(createSetContext("k1") as IStorage.WriteContext, source);
    source[0] = 99;

    // 検証：
    expect(storage.read(createGetContext("k1") as IStorage.ReadContext)).toStrictEqual(
      new Uint8Array([1, 2, 3]),
    );
  });

  test("clone は書き込み時と読み取り時に呼ばれる", ({ expect }) => {
    // 準備：
    const calls: unknown[] = [];
    const storage = new Memory({
      clone: <T>(value: T): T => {
        calls.push(value);

        return structuredClone(value);
      },
    });

    // 実行：
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    storage.read(createGetContext("k1") as IStorage.ReadContext);

    // 検証：
    expect(calls).toStrictEqual(["v1", "v1"]);
  });

  test("clone の戻り値が保存される", ({ expect }) => {
    // 準備：
    const storage = new Memory({
      // oxlint-disable-next-line unicorn/prefer-structured-clone
      clone: <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T,
    });

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

  test("clone が書き込み時に投げたとき、値は保存されない", ({ expect }) => {
    // 準備：
    const storage = new Memory({
      clone: <T>(_value: T): T => {
        throw new Error("clone failed");
      },
    });

    // 実行：
    const error = captureThrown(() => {
      storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    });

    // 検証：
    expect((error as Error).message).toBe("clone failed");
    expect(storage.exists(createHasContext("k1") as IStorage.ExistsContext)).toBe(false);
  });

  test("clone が読み取り時に投げたとき、そのエラーが伝播する", ({ expect }) => {
    // 準備：
    let calls = 0;
    const storage = new Memory({
      clone: <T>(value: T): T => {
        calls += 1;
        // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
        if (calls === 2) {
          throw new Error("clone failed");
        }

        return structuredClone(value);
      },
    });
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");

    // 実行：
    const error = captureThrown(() => storage.read(createGetContext("k1") as IStorage.ReadContext));

    // 検証：
    expect((error as Error).message).toBe("clone failed");

    expect(storage.exists(createHasContext("k1") as IStorage.ExistsContext)).toBe(true);
  });
});
