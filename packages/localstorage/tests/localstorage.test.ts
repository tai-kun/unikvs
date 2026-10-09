import { beforeEach, describe, test } from "vitest";

import LocalStorage from "../src/localstorage.js";
import { createFakeStorage } from "./_helpers.js";

const { signal } = new AbortController();

describe("初期化と接続管理", () => {
  test("引数なしで構築したとき、既定値で初期化される", ({ expect }) => {
    // 実行
    const storage = new LocalStorage();

    // 検証
    expect(storage.name).toBe("LocalStorage");
    expect(storage.allowRepair).toBe(false);
    expect(storage.allowClearWithoutPrefix).toBe(false);
    expect(storage.isOpen).toBe(true);
  });

  test("初期状態のとき、isOpen は true である", ({ expect }) => {
    // 準備
    const storage = new LocalStorage({ storage: createFakeStorage() });

    // 実行と検証
    expect(storage.isOpen).toBe(true);
  });
});

describe("基本操作（CRUD）", () => {
  let storage: LocalStorage;

  beforeEach(async () => {
    storage = new LocalStorage({ storage: createFakeStorage() });
  });

  test("データを保存したとき、そのキーでデータを取得できる", ({ expect }) => {
    // 準備
    const key = "k1";
    const data = "v1";

    // 実行
    storage.write({ key, data, vars: {}, signal });
    const result = storage.read({ key, signal });

    // 検証
    expect(result).toBe(data);
  });

  test("データが存在するとき、exists が true を返す", ({ expect }) => {
    // 準備
    const key = "k1";
    storage.write({ key, data: "v1", vars: {}, signal });

    // 実行
    const result = storage.exists({ key, signal });

    // 検証
    expect(result).toBe(true);
  });

  test("データが存在しないとき、exists が false を返す", ({ expect }) => {
    // 実行
    const result = storage.exists({ key: "none", signal });

    // 検証
    expect(result).toBe(false);
  });

  test("データを削除したとき、そのデータが存在しなくなる", ({ expect }) => {
    // 準備
    const key = "k1";
    storage.write({ key, data: "v1", vars: {}, signal });

    // 実行
    storage.delete({ key, signal });

    // 検証
    expect(storage.exists({ key, signal })).toBe(false);
  });

  test("全データを消去したとき、すべてのキーが存在しなくなる", ({ expect }) => {
    // 準備
    storage.write({ key: "k1", data: "v1", vars: {}, signal });
    storage.write({ key: "k2", data: "v2", vars: {}, signal });

    // 実行
    storage.clear({ signal });

    // 検証
    expect(storage.exists({ key: "k1", signal })).toBe(false);
    expect(storage.exists({ key: "k2", signal })).toBe(false);
  });

  test("既存のキーに対してデータを書き込んだとき、値が更新される", ({ expect }) => {
    // 準備
    const key = "k1";
    storage.write({ key, data: "v1", vars: {}, signal });

    // 実行
    storage.write({ key, data: "v2", vars: {}, signal });
    const result = storage.read({ key, signal });

    // 検証
    expect(result).toBe("v2");
  });
});
