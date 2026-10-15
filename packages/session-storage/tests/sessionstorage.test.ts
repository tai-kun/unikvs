import type { IStorage } from "@unikvs/core";
import {
  createClearContext,
  createDeleteContext,
  createGetContext,
  createHasContext,
  createSetContext,
} from "@unikvs/testing";
import { beforeEach, describe, test } from "vitest";

import SessionStorage from "../src/sessionstorage.js";
import { createFakeStorage } from "./_helpers.js";

const { signal } = new AbortController();

describe("初期化と接続管理", () => {
  test("引数なしで構築したとき、既定値で初期化される", ({ expect }) => {
    // 実行
    const storage = new SessionStorage();

    // 検証
    expect(storage.name).toBe("SessionStorage");
    expect(storage.allowClearWithoutPrefix).toBe(false);
    expect(storage.isOpen).toBe(true);
  });

  test("初期状態のとき、isOpen は true である", ({ expect }) => {
    // 準備
    const storage = new SessionStorage({ storage: createFakeStorage() });

    // 実行と検証
    expect(storage.isOpen).toBe(true);
  });
});

describe("基本操作（CRUD）", () => {
  let storage: SessionStorage;

  beforeEach(async () => {
    storage = new SessionStorage({ storage: createFakeStorage() });
  });

  test("データを保存したとき、そのキーでデータを取得できる", ({ expect }) => {
    // 準備
    const key = "k1";
    const data = "v1";

    // 実行
    storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);
    const result = storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);

    // 検証
    expect(result).toBe(data);
  });

  test("データが存在するとき、exists が true を返す", ({ expect }) => {
    // 準備
    const key = "k1";
    storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, "v1");

    // 実行
    const result = storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext);

    // 検証
    expect(result).toBe(true);
  });

  test("データが存在しないとき、exists が false を返す", ({ expect }) => {
    // 実行
    const result = storage.exists(createHasContext("none", { signal }) as IStorage.ExistsContext);

    // 検証
    expect(result).toBe(false);
  });

  test("データを削除したとき、そのデータが存在しなくなる", ({ expect }) => {
    // 準備
    const key = "k1";
    storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, "v1");

    // 実行
    storage.delete(createDeleteContext(key, { signal }) as IStorage.DeleteContext);

    // 検証
    expect(storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext)).toBe(false);
  });

  test("全データを消去したとき、すべてのキーが存在しなくなる", ({ expect }) => {
    // 準備
    storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");
    storage.write(createSetContext("k2", { signal }) as IStorage.WriteContext, "v2");

    // 実行
    storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);

    // 検証
    expect(storage.exists(createHasContext("k1", { signal }) as IStorage.ExistsContext)).toBe(
      false,
    );
    expect(storage.exists(createHasContext("k2", { signal }) as IStorage.ExistsContext)).toBe(
      false,
    );
  });

  test("既存のキーに対してデータを書き込んだとき、値が更新される", ({ expect }) => {
    // 準備
    const key = "k1";
    storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, "v1");

    // 実行
    storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, "v2");
    const result = storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);

    // 検証
    expect(result).toBe("v2");
  });
});
