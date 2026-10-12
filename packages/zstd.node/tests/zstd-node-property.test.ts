import { bytesEqual, forCasesAsync } from "@unikvs/testing";
import { describe, test } from "vitest";

import ZstdNode from "../src/zstd-node.js";

const SEED = 20240927;
const CASE_COUNT = 50;
const LEVELS = [undefined, 1, 3, 10, 22] as const;

describe("決定的ファズテスト", () => {
  test("ランダムなバイト列をランダムなレベルで往復すると元のデータに戻る", async ({
    expect,
    signal,
  }) => {
    // 実行と検証
    await forCasesAsync(SEED, CASE_COUNT, async (random) => {
      const level = random.pick(LEVELS);
      const input = random.bytes(random.uint(2048));
      const target = level === undefined ? new ZstdNode() : new ZstdNode({ level });
      await target.open({ signal });

      const encoded = await target.encode({ data: input });
      const decoded = await target.decode({ data: encoded });

      expect(bytesEqual(decoded, input)).toBe(true);
    });
  });
});
