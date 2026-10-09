import { describe, test } from "vitest";

import Http from "../src/http.js";
import { createMockServer } from "./_helpers.js";

const baseUrl = "https://kv.example.com/store";

describe("prefix による分離", () => {
  test("同じキーでも prefix が違えば別の値として扱われる", async ({ expect }) => {
    // 準備
    const server = createMockServer();
    const storageA = new Http(baseUrl, { fetch: server.fetch, keyPrefix: "a:" });
    const storageB = new Http(baseUrl, { fetch: server.fetch, keyPrefix: "b:" });

    // 実行
    await storageA.write({
      key: "k",
      data: new Uint8Array([1]),
      signal: AbortSignal.timeout(5_000),
      vars: {},
    });
    await storageB.write({
      key: "k",
      data: new Uint8Array([2]),
      signal: AbortSignal.timeout(5_000),
      vars: {},
    });

    // 検証
    expect(
      await storageA.read({ key: "k", signal: AbortSignal.timeout(5_000), vars: {} }),
    ).toStrictEqual(new Uint8Array([1]));
    expect(
      await storageB.read({ key: "k", signal: AbortSignal.timeout(5_000), vars: {} }),
    ).toStrictEqual(new Uint8Array([2]));
  });

  test("片方の delete はもう片方に影響しない", async ({ expect }) => {
    // 準備
    const server = createMockServer();
    const storageA = new Http(baseUrl, { fetch: server.fetch, keyPrefix: "a:" });
    const storageB = new Http(baseUrl, { fetch: server.fetch, keyPrefix: "b:" });
    await storageA.write({
      key: "k",
      data: new Uint8Array([1]),
      signal: AbortSignal.timeout(5_000),
      vars: {},
    });
    await storageB.write({
      key: "k",
      data: new Uint8Array([2]),
      signal: AbortSignal.timeout(5_000),
      vars: {},
    });

    // 実行
    await storageA.delete({ key: "k", signal: AbortSignal.timeout(5_000), vars: {} });

    // 検証
    expect(await storageA.exists({ key: "k", signal: AbortSignal.timeout(5_000), vars: {} })).toBe(
      false,
    );
    expect(await storageB.exists({ key: "k", signal: AbortSignal.timeout(5_000), vars: {} })).toBe(
      true,
    );
  });
});
