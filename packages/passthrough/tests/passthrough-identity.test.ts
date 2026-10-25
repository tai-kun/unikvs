import type { IMiddleware } from "@unikvs/core";
import { createNext, createDecodeContext, createEncodeContext } from "@unikvs/testing";
import { test as vitest, describe } from "vite-plus/test";

import { PassThrough } from "../src/index.js";

const test = vitest.extend<{ passthrough: PassThrough }>({
  async passthrough({}, use) {
    await use(new PassThrough());
  },
});

/**
 * 値をエンコードして出力された値を返します。
 * 同一参照で返されることを検証するために使用します。
 */
async function encode(data: unknown, passthrough: PassThrough): Promise<unknown> {
  const c = createEncodeContext(data);
  await passthrough.encode(c as IMiddleware.EncodeContext, createNext());

  return c.destination;
}

/**
 * 値をデコードして出力された値を返します。
 * 同一参照で返されることを検証するために使用します。
 */
async function decode(data: unknown, passthrough: PassThrough): Promise<unknown> {
  const c = createDecodeContext(data);
  await passthrough.decode(c as IMiddleware.DecodeContext, createNext());

  return c.destination;
}

const VALUE_CASES: [label: string, create: () => unknown][] = [
  ["数値", () => 42],
  ["bigint", () => 123n],
  ["null", () => null],
  ["undefined", () => {}],
  ["配列", () => [1, 2, 3]],
  ["ネストしたオブジェクト", () => ({ outer: { inner: ["a", 1] } })],
  ["関数", () => () => 1],
  ["シンボル", () => Symbol("value")],
];
describe("encode の値の透過", () => {
  for (const [label, create] of VALUE_CASES) {
    test(`encode は ${label} を同一参照で返す`, async ({ expect, passthrough }) => {
      // 準備：
      const data = create();

      // 実行：
      const output = await encode(data, passthrough);

      // 検証：
      expect(output).toBe(data);
    });
  }

  test("encode はコンテキストの変数を変更しない", async ({ expect, passthrough }) => {
    // 準備：
    const data = { id: 1 };
    const c = createEncodeContext(data, "k1", { values: { key: "value" } });

    // 実行：
    await passthrough.encode(c as IMiddleware.EncodeContext, createNext());

    // 検証：
    expect(c.destination).toBe(data);
    expect(c.get("key")).toBe("value");
    expect(c.signal.aborted).toBe(false);
  });

  test("encode は呼び出しごとに入力をそのまま返す", async ({ expect, passthrough }) => {
    // 準備：
    const first = { id: 1 };
    const second = { id: 2 };

    // 実行：
    const firstOutput = await encode(first, passthrough);
    const secondOutput = await encode(second, passthrough);

    // 検証：
    expect(firstOutput).toBe(first);
    expect(secondOutput).toBe(second);
    expect(firstOutput).not.toBe(secondOutput);
  });
});
describe("decode の値の透過", () => {
  for (const [label, create] of VALUE_CASES) {
    test(`decode は ${label} を同一参照で返す`, async ({ expect, passthrough }) => {
      // 準備：
      const data = create();

      // 実行：
      const output = await decode(data, passthrough);

      // 検証：
      expect(output).toBe(data);
    });
  }

  test("decode はコンテキストの変数を変更しない", async ({ expect, passthrough }) => {
    // 準備：
    const data = { id: 1 };
    const c = createDecodeContext(data, "k1", { values: { key: "value" } });

    // 実行：
    await passthrough.decode(c as IMiddleware.DecodeContext, createNext());

    // 検証：
    expect(c.destination).toBe(data);
    expect(c.get("key")).toBe("value");
    expect(c.signal.aborted).toBe(false);
  });

  test("decode は呼び出しごとに入力をそのまま返す", async ({ expect, passthrough }) => {
    // 準備：
    const first = { id: 1 };
    const second = { id: 2 };

    // 実行：
    const firstOutput = await decode(first, passthrough);
    const secondOutput = await decode(second, passthrough);

    // 検証：
    expect(firstOutput).toBe(first);
    expect(secondOutput).toBe(second);
    expect(firstOutput).not.toBe(secondOutput);
  });
});
