import type { IStorage } from "@unikvs/core";
import {
  createGetContext,
  createHasContext,
  createSetContext,
  createCopyContext,
  createMoveContext,
} from "@unikvs/testing";
import { test as vitest, describe } from "vite-plus/test";

import { KeyNotFoundError } from "../src/errors.js";
import Memory from "../src/memory.js";

/**
 * テストごとに空の Memory インスタンスを提供します。
 * コピーと移動の振る舞いを検証するために使用します。
 */
const test = vitest.extend<{ storage: Memory }>({
  async storage({}, use) {
    await use(new Memory());
  },
});
describe("コピー", () => {
  test("コピー元を残したままコピー先へ値を複製する", ({ expect, storage }) => {
    // 準備：
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");

    // 実行：
    storage.copy(createCopyContext("k1", "k2") as IStorage.CopyContext);

    // 検証：
    expect(storage.read(createGetContext("k1") as IStorage.ReadContext)).toBe("v1");
    expect(storage.read(createGetContext("k2") as IStorage.ReadContext)).toBe("v1");
  });

  test("コピー先の既存値を上書きする", ({ expect, storage }) => {
    // 準備：
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    storage.write(createSetContext("k2") as IStorage.WriteContext, "old");

    // 実行：
    storage.copy(createCopyContext("k1", "k2") as IStorage.CopyContext);

    // 検証：
    expect(storage.read(createGetContext("k1") as IStorage.ReadContext)).toBe("v1");
    expect(storage.read(createGetContext("k2") as IStorage.ReadContext)).toBe("v1");
  });

  test("存在しないキーの copy は KeyNotFoundError を投げる", ({ expect, storage }) => {
    // 実行と検証：
    expect(() => {
      storage.copy(createCopyContext("unknown", "k2") as IStorage.CopyContext);
    }).toThrow(KeyNotFoundError);
  });

  test("同じキーへの copy は値を削除せず成功する", ({ expect, storage }) => {
    // 準備：
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");

    // 実行：
    storage.copy(createCopyContext("k1", "k1") as IStorage.CopyContext);

    // 検証：
    expect(storage.read(createGetContext("k1") as IStorage.ReadContext)).toBe("v1");
  });

  test("存在しないキーから同じキーへの copy は KeyNotFoundError を投げる", ({
    expect,
    storage,
  }) => {
    // 実行と検証：
    expect(() => {
      storage.copy(createCopyContext("unknown", "unknown") as IStorage.CopyContext);
    }).toThrow(KeyNotFoundError);
  });
});
describe("移動", () => {
  test("移動先へ値を移し移動元を削除する", ({ expect, storage }) => {
    // 準備：
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");

    // 実行：
    storage.move(createMoveContext("k1", "k2") as IStorage.MoveContext);

    // 検証：
    expect(storage.exists(createHasContext("k1") as IStorage.ExistsContext)).toBe(false);
    expect(storage.read(createGetContext("k2") as IStorage.ReadContext)).toBe("v1");
  });

  test("移動先の既存値を上書きする", ({ expect, storage }) => {
    // 準備：
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    storage.write(createSetContext("k2") as IStorage.WriteContext, "old");

    // 実行：
    storage.move(createMoveContext("k1", "k2") as IStorage.MoveContext);

    // 検証：
    expect(storage.exists(createHasContext("k1") as IStorage.ExistsContext)).toBe(false);
    expect(storage.read(createGetContext("k2") as IStorage.ReadContext)).toBe("v1");
  });

  test("存在しないキーの move は KeyNotFoundError を投げる", ({ expect, storage }) => {
    // 実行と検証：
    expect(() => {
      storage.move(createMoveContext("unknown", "k2") as IStorage.MoveContext);
    }).toThrow(KeyNotFoundError);
  });

  test("同じキーへの move は値を削除せず成功する", ({ expect, storage }) => {
    // 準備：
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");

    // 実行：
    storage.move(createMoveContext("k1", "k1") as IStorage.MoveContext);

    // 検証：
    expect(storage.read(createGetContext("k1") as IStorage.ReadContext)).toBe("v1");
  });

  test("存在しないキーから同じキーへの move は KeyNotFoundError を投げる", ({
    expect,
    storage,
  }) => {
    // 実行と検証：
    expect(() => {
      storage.move(createMoveContext("unknown", "unknown") as IStorage.MoveContext);
    }).toThrow(KeyNotFoundError);
  });
});
