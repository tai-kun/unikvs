import type { IMiddleware } from "@unikvs/core";
import { type Random, createNext, forCasesAsync, createDecodeContext } from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

import ReadOnly from "../src/readonly.js";

const seed = 20_260_930;

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
      return random.int(-2_147_483_648, 2_147_483_647);
    }

    case 2: {
      return random.bool();
    }

    case 3: {
      return null;
    }

    case 4: {
      return random.array(random.int(0, 4), () => random.int(-2_147_483_648, 2_147_483_647));
    }

    default: {
      return random.bytes(random.int(0, 16));
    }
  }
}

describe("ReadOnly のプロパティー", () => {
  test("decode は任意の型の値を同一参照で返す", async ({ expect }) => {
    await forCasesAsync(seed, 100, async (random) => {
      // 準備：
      const transformer = new ReadOnly();
      const value = generateValue(random);

      // 実行：
      const c = createDecodeContext(value, "k1");
      await transformer.decode(c as IMiddleware.DecodeContext, createNext());

      // 検証：
      expect(c.destination).toBe(value);
    });
  });
});
