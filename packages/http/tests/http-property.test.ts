import type { IStorage } from "@unikvs/core";
import {
  createRandom,
  forCasesAsync,
  createGetContext,
  createHasContext,
  createSetContext,
} from "@unikvs/testing";
import { describe, test } from "vitest";

import Http from "../src/http.js";
import { createMockServer } from "./_helpers.js";

const seed = 20261009;
const baseUrl = "https://kv.example.com/store";

const keyAlphabet = ["", "a", "key", "key/1", "🔑", "__proto__", "a.b", "a:b", "..", "あ"];

describe("任意値の往復", () => {
  test("ランダムなキーとバイナリーを保存したとき、すべて取得できる", async ({ expect }) => {
    // 準備
    const { fetch } = createMockServer();
    const storage = new Http(baseUrl, { fetch });

    // 実行と検証
    await forCasesAsync(seed, 50, async (random) => {
      const key = random.bool() ? random.pick(keyAlphabet) : random.string(random.int(0, 12));
      const data = random.bytes(random.int(0, 1024));
      await storage.write(
        createSetContext(key, { signal: AbortSignal.timeout(5_000) }) as IStorage.WriteContext,
        data,
      );
      const result = await storage.read(
        createGetContext(key, { signal: AbortSignal.timeout(5_000) }) as IStorage.ReadContext,
      );
      expect(result).toStrictEqual(data);
      expect(
        await storage.exists(
          createHasContext(key, { signal: AbortSignal.timeout(5_000) }) as IStorage.ExistsContext,
        ),
      ).toBe(true);
    });
  });

  test("同じ seed では同じ入力列が再現される", ({ expect }) => {
    // 実行
    const first = createRandom(seed).string(8);
    const second = createRandom(seed).string(8);

    // 検証
    expect(first).toBe(second);
  });
});
