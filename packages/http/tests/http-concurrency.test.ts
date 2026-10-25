import type { IStorage } from "@unikvs/core";
import { createGetContext, createHasContext, createSetContext } from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

import Http from "../src/http.js";
import { createMockServer } from "./_helpers.js";

const baseUrl = "https://kv.example.com/store";

/**
 * 並行書き込みの結果がいずれかの書き込み値と一致するかを判定します。
 * テスト本体での条件分岐を避けるために使用します。
 */
function hasWrittenValue(values: readonly Uint8Array[], result: Uint8Array): boolean {
  return values.some((v) => v[0] === result[0] && v.length === result.length);
}

describe("並行操作", () => {
  test("同一キーへの並行 write は書込値のいずれかに収束する", async ({ expect }) => {
    // 準備：
    const { fetch } = createMockServer();
    const storage = new Http(baseUrl, { fetch });
    const values = [new Uint8Array([1]), new Uint8Array([2]), new Uint8Array([3])];

    // 実行：
    await Promise.all(
      values.map((data) =>
        storage.write(
          createSetContext("k", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
          data,
        ),
      ),
    );

    const result = await storage.read(
      createGetContext("k", { signal: AbortSignal.timeout(5000) }) as IStorage.ReadContext,
    );

    // 検証：
    expect(hasWrittenValue(values, result)).toBe(true);

    expect(
      await storage.exists(
        createHasContext("k", { signal: AbortSignal.timeout(5000) }) as IStorage.ExistsContext,
      ),
    ).toBe(true);
  });

  test("異なるキーへの並行 write はすべて保存される", async ({ expect }) => {
    // 準備：
    const { fetch } = createMockServer();
    const storage = new Http(baseUrl, { fetch });

    // 実行：
    await Promise.all(
      [0, 1, 2, 3, 4].map((i) =>
        storage.write(
          createSetContext(`k${i}`, {
            signal: AbortSignal.timeout(5000),
          }) as IStorage.WriteContext,
          new Uint8Array([i]),
        ),
      ),
    );

    // 検証：
    for (let i = 0; i < 5; i += 1) {
      expect(
        await storage.read(
          createGetContext(`k${i}`, { signal: AbortSignal.timeout(5000) }) as IStorage.ReadContext,
        ),
      ).toStrictEqual(new Uint8Array([i]));
    }
  });
});
