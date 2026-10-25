import type { IStorage } from "@unikvs/core";
import {
  createGetContext,
  createHasContext,
  createSetContext,
  createDeleteContext,
} from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

import Http from "../src/http.js";
import { createMockServer } from "./_helpers.js";

const baseUrl = "https://kv.example.com/store";
describe("prefix による分離", () => {
  test("同じキーでも prefix が違えば別の値として扱われる", async ({ expect }) => {
    // 準備：
    const server = createMockServer();
    const storageA = new Http(baseUrl, {
      fetch: server.fetch,
      keyPrefix: "a:",
    });
    const storageB = new Http(baseUrl, {
      fetch: server.fetch,
      keyPrefix: "b:",
    });

    // 実行：
    await storageA.write(
      createSetContext("k", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    await storageB.write(
      createSetContext("k", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      new Uint8Array([2]),
    );

    // 検証：
    expect(
      await storageA.read(
        createGetContext("k", { signal: AbortSignal.timeout(5000) }) as IStorage.ReadContext,
      ),
    ).toStrictEqual(new Uint8Array([1]));
    expect(
      await storageB.read(
        createGetContext("k", { signal: AbortSignal.timeout(5000) }) as IStorage.ReadContext,
      ),
    ).toStrictEqual(new Uint8Array([2]));
  });

  test("片方の delete はもう片方に影響しない", async ({ expect }) => {
    // 準備：
    const server = createMockServer();
    const storageA = new Http(baseUrl, {
      fetch: server.fetch,
      keyPrefix: "a:",
    });
    const storageB = new Http(baseUrl, {
      fetch: server.fetch,
      keyPrefix: "b:",
    });
    await storageA.write(
      createSetContext("k", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    await storageB.write(
      createSetContext("k", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      new Uint8Array([2]),
    );

    // 実行：
    await storageA.delete(
      createDeleteContext("k", { signal: AbortSignal.timeout(5000) }) as IStorage.DeleteContext,
    );

    // 検証：
    expect(
      await storageA.exists(
        createHasContext("k", { signal: AbortSignal.timeout(5000) }) as IStorage.ExistsContext,
      ),
    ).toBe(false);
    expect(
      await storageB.exists(
        createHasContext("k", { signal: AbortSignal.timeout(5000) }) as IStorage.ExistsContext,
      ),
    ).toBe(true);
  });
});
