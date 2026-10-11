import { forCasesAsync } from "@unikvs/testing";
import { bytesEqual } from "@unikvs/testing";
import { describe, test } from "vitest";

import ZstdWasm from "../src/zstd-wasm.js";

/**
 * 中断されていないシグナルを作成します。
 */
function createSignal(): AbortSignal {
  return new AbortController().signal;
}

const SEED = 20240927;
const CASE_COUNT = 50;
const LEVELS = [undefined, 1, 3, 10, 22] as const;

describe("決定的ファズテスト", () => {
  test("ランダムなバイト列をランダムなレベルで往復すると元のデータに戻る", async ({ expect }) => {
    // 実行と検証
    await forCasesAsync(SEED, CASE_COUNT, async (random) => {
      const level = random.pick(LEVELS);
      const input = random.bytes(random.uint(2048));
      const target = level === undefined ? new ZstdWasm() : new ZstdWasm({ level });
      await target.open({ signal: createSignal() });

      const encoded = await target.encode({ data: input });
      const decoded = await target.decode({ data: encoded });

      expect(bytesEqual(decoded, input)).toBe(true);
    });
  });
});
