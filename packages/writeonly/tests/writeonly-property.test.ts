import { forCasesAsync, type Random } from "@unikvs/testing";
import { describe, test } from "vitest";

import WriteOnly from "../src/write-only.js";

const seed = 20260930;

type Value = string | number | boolean | null | readonly number[] | Uint8Array;

/**
 * 文字列・数値・真偽値・null・数値配列・バイト列を混ぜた値を生成します。
 * 任意の型の値がそのまま透過されることを検証するために使用します。
 */
function generateValue(random: Random): Value {
  switch (random.int(0, 5)) {
    case 0: {
      return random.string(random.int(0, 16));
    }
    case 1: {
      return random.int(-2147483648, 2147483647);
    }
    case 2: {
      return random.bool();
    }
    case 3: {
      return null;
    }
    case 4: {
      return random.array(random.int(0, 4), () => random.int(-2147483648, 2147483647));
    }
    default: {
      return random.bytes(random.int(0, 16));
    }
  }
}

describe("WriteOnly のプロパティー", () => {
  test("encode は任意の型の値を同一参照で返す", async ({ expect }) => {
    await forCasesAsync(seed, 100, async (random) => {
      // 準備
      const transformer = new WriteOnly();
      const value = generateValue(random);

      // 実行
      const output = transformer.encode({ data: value });

      // 検証
      expect(output).toBe(value);
    });
  });
});
