import type { IStorage } from "@unikvs/core";
import {
  createHasContext,
  createSetContext,
  createCopyContext,
  createMoveContext,
} from "@unikvs/testing";
import { test as vitest, describe } from "vite-plus/test";

import { KeyNotFoundError } from "../src/errors.js";
import Null from "../src/null.js";

/**
 * テストごとに空の Null インスタンスを提供します。
 * コピーと移動が常に失敗することを検証するために使用します。
 */
const test = vitest.extend<{ storage: Null }>({
  async storage({}, use) {
    await use(new Null());
  },
});
describe("コピー", () => {
  test("copy は KeyNotFoundError を投げる", ({ expect, storage }) => {
    // 準備：
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");

    // 実行と検証：
    expect(() => storage.copy(createCopyContext("k1", "k2") as IStorage.CopyContext)).toThrow(
      KeyNotFoundError,
    );
  });

  test("copy が投げる KeyNotFoundError はコピー元のキーを保持する", ({ expect, storage }) => {
    // 準備：
    const key = "k1";
    let error: unknown;

    // 実行：
    try {
      storage.copy(createCopyContext(key, "k2") as IStorage.CopyContext);
    } catch (ex) {
      error = ex;
    }

    // 検証：
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect(error).toMatchObject({ meta: { key } });
  });

  test("同じキーへの copy も KeyNotFoundError を投げる", ({ expect, storage }) => {
    // 実行と検証：
    expect(() => storage.copy(createCopyContext("k1", "k1") as IStorage.CopyContext)).toThrow(
      KeyNotFoundError,
    );
  });

  test("中断済みの信号を渡しても copy は KeyNotFoundError を投げる", ({ expect, storage }) => {
    // 準備：
    const controller = new AbortController();
    controller.abort();

    // 実行と検証：
    expect(() =>
      storage.copy(
        createCopyContext("k1", "k2", { signal: controller.signal }) as IStorage.CopyContext,
      ),
    ).toThrow(KeyNotFoundError);
  });
});
describe("移動", () => {
  test("move は KeyNotFoundError を投げる", ({ expect, storage }) => {
    // 準備：
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");

    // 実行と検証：
    expect(() => storage.move(createMoveContext("k1", "k2") as IStorage.MoveContext)).toThrow(
      KeyNotFoundError,
    );
  });

  test("move が投げる KeyNotFoundError は移動元のキーを保持する", ({ expect, storage }) => {
    // 準備：
    const key = "k1";
    let error: unknown;

    // 実行：
    try {
      storage.move(createMoveContext(key, "k2") as IStorage.MoveContext);
    } catch (ex) {
      error = ex;
    }

    // 検証：
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect(error).toMatchObject({ meta: { key } });
  });

  test("同じキーへの move も KeyNotFoundError を投げる", ({ expect, storage }) => {
    // 実行と検証：
    expect(() => storage.move(createMoveContext("k1", "k1") as IStorage.MoveContext)).toThrow(
      KeyNotFoundError,
    );
  });

  test("copy と move の失敗後も exists は false を返す", ({ expect, storage }) => {
    // 実行：
    expect(() => storage.copy(createCopyContext("k1", "k2") as IStorage.CopyContext)).toThrow(
      KeyNotFoundError,
    );
    expect(() => storage.move(createMoveContext("k1", "k2") as IStorage.MoveContext)).toThrow(
      KeyNotFoundError,
    );

    // 検証：
    expect(storage.exists(createHasContext("k1") as IStorage.ExistsContext)).toBe(false);
    expect(storage.exists(createHasContext("k2") as IStorage.ExistsContext)).toBe(false);
  });
});
