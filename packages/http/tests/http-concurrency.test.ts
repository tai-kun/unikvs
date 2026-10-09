import { describe, test } from "vitest";

import Http from "../src/http.js";
import { createMockServer } from "./_helpers.js";

const baseUrl = "https://kv.example.com/store";

describe("並行操作", () => {
  test("同一キーへの並行 write は書込値のいずれかに収束する", async ({ expect }) => {
    // 準備
    const { fetch } = createMockServer();
    const storage = new Http(baseUrl, { fetch });
    const values = [new Uint8Array([1]), new Uint8Array([2]), new Uint8Array([3])];

    // 実行
    await Promise.all(
      values.map((data) =>
        storage.write({ key: "k", data, signal: AbortSignal.timeout(5_000), vars: {} }),
      ),
    );
    const result = await storage.read({ key: "k", signal: AbortSignal.timeout(5_000), vars: {} });

    // 検証
    expect(values.some((v) => v[0] === result[0] && v.length === result.length)).toBe(true);
    expect(await storage.exists({ key: "k", signal: AbortSignal.timeout(5_000), vars: {} })).toBe(
      true,
    );
  });

  test("異なるキーへの並行 write はすべて保存される", async ({ expect }) => {
    // 準備
    const { fetch } = createMockServer();
    const storage = new Http(baseUrl, { fetch });

    // 実行
    await Promise.all(
      [0, 1, 2, 3, 4].map((i) =>
        storage.write({
          key: `k${i}`,
          data: new Uint8Array([i]),
          signal: AbortSignal.timeout(5_000),
          vars: {},
        }),
      ),
    );

    // 検証
    for (let i = 0; i < 5; i += 1) {
      expect(
        await storage.read({ key: `k${i}`, signal: AbortSignal.timeout(5_000), vars: {} }),
      ).toStrictEqual(new Uint8Array([i]));
    }
  });
});
