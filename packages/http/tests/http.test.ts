import type { IStorage } from "@unikvs/core";
import {
  createClearContext,
  createDeleteContext,
  createGetContext,
  createHasContext,
  createSetContext,
} from "@unikvs/testing";
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
    await storage.write(
      createSetContext("k1", { signal: AbortSignal.timeout(5_000) }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

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
    await storage.write(
      createSetContext("k1", { signal: AbortSignal.timeout(5_000) }) as IStorage.WriteContext,
      new Uint8Array([1, 2, 3]),
    );
    const result = await storage.read(
      createGetContext("k1", { signal: AbortSignal.timeout(5_000) }) as IStorage.ReadContext,
    );

    // 検証
    expect(result).toStrictEqual(new Uint8Array([1, 2, 3]));
  });

  test("データが存在するとき、exists が true を返す", async ({ expect }) => {
    // 準備
    const { fetch } = createMockServer();
    const storage = new Http("https://kv.example.com/store", { fetch });
    await storage.write(
      createSetContext("k1", { signal: AbortSignal.timeout(5_000) }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

    // 実行
    const result = await storage.exists(
      createHasContext("k1", { signal: AbortSignal.timeout(5_000) }) as IStorage.ExistsContext,
    );

    // 検証
    expect(result).toBe(true);
  });

  test("データが存在しないとき、exists が false を返す", async ({ expect }) => {
    // 準備
    const { fetch } = createMockServer();
    const storage = new Http("https://kv.example.com/store", { fetch });

    // 実行
    const result = await storage.exists(
      createHasContext("none", { signal: AbortSignal.timeout(5_000) }) as IStorage.ExistsContext,
    );

    // 検証
    expect(result).toBe(false);
  });

  test("データを削除したとき、そのデータが存在しなくなる", async ({ expect }) => {
    // 準備
    const { fetch } = createMockServer();
    const storage = new Http("https://kv.example.com/store", { fetch });
    await storage.write(
      createSetContext("k1", { signal: AbortSignal.timeout(5_000) }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

    // 実行
    await storage.delete(
      createDeleteContext("k1", { signal: AbortSignal.timeout(5_000) }) as IStorage.DeleteContext,
    );

    // 検証
    expect(
      await storage.exists(
        createHasContext("k1", { signal: AbortSignal.timeout(5_000) }) as IStorage.ExistsContext,
      ),
    ).toBe(false);
  });

  test("全データを消去したとき、すべてのキーが存在しなくなる", async ({ expect }) => {
    // 準備
    const { fetch } = createMockServer();
    const storage = new Http("https://kv.example.com/store", { fetch });
    await storage.write(
      createSetContext("k1", { signal: AbortSignal.timeout(5_000) }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    await storage.write(
      createSetContext("k2", { signal: AbortSignal.timeout(5_000) }) as IStorage.WriteContext,
      new Uint8Array([2]),
    );

    // 実行
    await storage.clear(
      createClearContext("", { signal: AbortSignal.timeout(5_000) }) as IStorage.ClearContext,
    );

    // 検証
    expect(
      await storage.exists(
        createHasContext("k1", { signal: AbortSignal.timeout(5_000) }) as IStorage.ExistsContext,
      ),
    ).toBe(false);
    expect(
      await storage.exists(
        createHasContext("k2", { signal: AbortSignal.timeout(5_000) }) as IStorage.ExistsContext,
      ),
    ).toBe(false);
  });
});
