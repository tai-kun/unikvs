import { describe, test } from "vitest";

import Http from "../src/http.js";
import { createMockServer } from "./_helpers.js";

describe("初期化と接続管理", () => {
  test("名前は Http である", ({ expect }) => {
    // 準備
    const { fetch } = createMockServer();

    // 実行
    const storage = new Http("https://kv.example.com/store", { fetch });

    // 検証
    expect(storage.name).toBe("Http");
  });

  test("初期状態のとき、isOpen は true である", ({ expect }) => {
    // 準備
    const { fetch } = createMockServer();
    const storage = new Http("https://kv.example.com/store", { fetch });

    // 実行と検証
    expect(storage.isOpen).toBe(true);
  });

  test("操作のあとも isOpen は true のままである", async ({ expect }) => {
    // 準備
    const { fetch } = createMockServer();
    const storage = new Http("https://kv.example.com/store", { fetch });

    // 実行
    await storage.write({
      key: "k1",
      data: new Uint8Array([1]),
      signal: AbortSignal.timeout(5_000),
      vars: {},
    });

    // 検証
    expect(storage.isOpen).toBe(true);
  });
});

describe("基本操作（CRUD）", () => {
  test("データを保存したとき、そのキーでデータを取得できる", async ({ expect }) => {
    // 準備
    const { fetch } = createMockServer();
    const storage = new Http("https://kv.example.com/store", { fetch });

    // 実行
    await storage.write({
      key: "k1",
      data: new Uint8Array([1, 2, 3]),
      signal: AbortSignal.timeout(5_000),
      vars: {},
    });
    const result = await storage.read({
      key: "k1",
      signal: AbortSignal.timeout(5_000),
      vars: {},
    });

    // 検証
    expect(result).toStrictEqual(new Uint8Array([1, 2, 3]));
  });

  test("データが存在するとき、exists が true を返す", async ({ expect }) => {
    // 準備
    const { fetch } = createMockServer();
    const storage = new Http("https://kv.example.com/store", { fetch });
    await storage.write({
      key: "k1",
      data: new Uint8Array([1]),
      signal: AbortSignal.timeout(5_000),
      vars: {},
    });

    // 実行
    const result = await storage.exists({
      key: "k1",
      signal: AbortSignal.timeout(5_000),
      vars: {},
    });

    // 検証
    expect(result).toBe(true);
  });

  test("データが存在しないとき、exists が false を返す", async ({ expect }) => {
    // 準備
    const { fetch } = createMockServer();
    const storage = new Http("https://kv.example.com/store", { fetch });

    // 実行
    const result = await storage.exists({
      key: "none",
      signal: AbortSignal.timeout(5_000),
      vars: {},
    });

    // 検証
    expect(result).toBe(false);
  });

  test("データを削除したとき、そのデータが存在しなくなる", async ({ expect }) => {
    // 準備
    const { fetch } = createMockServer();
    const storage = new Http("https://kv.example.com/store", { fetch });
    await storage.write({
      key: "k1",
      data: new Uint8Array([1]),
      signal: AbortSignal.timeout(5_000),
      vars: {},
    });

    // 実行
    await storage.delete({ key: "k1", signal: AbortSignal.timeout(5_000), vars: {} });

    // 検証
    expect(await storage.exists({ key: "k1", signal: AbortSignal.timeout(5_000), vars: {} })).toBe(
      false,
    );
  });

  test("全データを消去したとき、すべてのキーが存在しなくなる", async ({ expect }) => {
    // 準備
    const { fetch } = createMockServer();
    const storage = new Http("https://kv.example.com/store", { fetch });
    await storage.write({
      key: "k1",
      data: new Uint8Array([1]),
      signal: AbortSignal.timeout(5_000),
      vars: {},
    });
    await storage.write({
      key: "k2",
      data: new Uint8Array([2]),
      signal: AbortSignal.timeout(5_000),
      vars: {},
    });

    // 実行
    await storage.clear({ signal: AbortSignal.timeout(5_000), vars: {} });

    // 検証
    expect(await storage.exists({ key: "k1", signal: AbortSignal.timeout(5_000), vars: {} })).toBe(
      false,
    );
    expect(await storage.exists({ key: "k2", signal: AbortSignal.timeout(5_000), vars: {} })).toBe(
      false,
    );
  });
});
