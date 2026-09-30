import type { ITransformer } from "@unikvs/core";
import { describe, test as vitest } from "vitest";

import { PassThrough } from "../src/index.js";

const test = vitest.extend<{ passthrough: PassThrough }>({
  // oxlint-disable-next-line no-empty-pattern
  async passthrough({}, use) {
    await use(new PassThrough());
  },
});

const VALUE_CASES: Array<[label: string, create: () => unknown]> = [
  ["数値", () => 42],
  ["bigint", () => 123n],
  ["null", () => null],
  ["undefined", () => undefined],
  ["配列", () => [1, 2, 3]],
  ["ネストしたオブジェクト", () => ({ outer: { inner: ["a", 1] } })],
  ["関数", () => () => 1],
  ["シンボル", () => Symbol("value")],
];

describe("encode の値の透過", () => {
  for (const [label, create] of VALUE_CASES) {
    test(`encode は ${label} を同一参照で返す`, ({ expect, passthrough }) => {
      // 準備
      const data = create();

      // 実行
      const output = passthrough.encode({ data });

      // 検証
      expect(output).toBe(data);
    });
  }

  test("encode は vars と signal を変更しない", ({ expect, passthrough }) => {
    // 準備
    const data = { id: 1 };
    const vars: Record<string, unknown> = { key: "value" };
    const controller = new AbortController();
    const args: ITransformer.EncodeArgs<{ id: number }> = {
      vars,
      data,
      signal: controller.signal,
    };
    Object.freeze(vars);
    Object.freeze(args);

    // 実行
    const output = passthrough.encode(args);

    // 検証
    expect(output).toBe(data);
    expect(vars).toStrictEqual({ key: "value" });
    expect(controller.signal.aborted).toBe(false);
  });

  test("encode は呼び出しごとに入力をそのまま返す", ({ expect, passthrough }) => {
    // 準備
    const first = { id: 1 };
    const second = { id: 2 };

    // 実行
    const firstOutput = passthrough.encode({ data: first });
    const secondOutput = passthrough.encode({ data: second });

    // 検証
    expect(firstOutput).toBe(first);
    expect(secondOutput).toBe(second);
    expect(firstOutput).not.toBe(secondOutput);
  });
});

describe("decode の値の透過", () => {
  for (const [label, create] of VALUE_CASES) {
    test(`decode は ${label} を同一参照で返す`, ({ expect, passthrough }) => {
      // 準備
      const data = create();

      // 実行
      const output = passthrough.decode({ data });

      // 検証
      expect(output).toBe(data);
    });
  }

  test("decode は vars と signal を変更しない", ({ expect, passthrough }) => {
    // 準備
    const data = { id: 1 };
    const vars: Record<string, unknown> = { key: "value" };
    const controller = new AbortController();
    const args: ITransformer.DecodeArgs<{ id: number }> = {
      vars,
      data,
      signal: controller.signal,
    };
    Object.freeze(vars);
    Object.freeze(args);

    // 実行
    const output = passthrough.decode(args);

    // 検証
    expect(output).toBe(data);
    expect(vars).toStrictEqual({ key: "value" });
    expect(controller.signal.aborted).toBe(false);
  });

  test("decode は呼び出しごとに入力をそのまま返す", ({ expect, passthrough }) => {
    // 準備
    const first = { id: 1 };
    const second = { id: 2 };

    // 実行
    const firstOutput = passthrough.decode({ data: first });
    const secondOutput = passthrough.decode({ data: second });

    // 検証
    expect(firstOutput).toBe(first);
    expect(secondOutput).toBe(second);
    expect(firstOutput).not.toBe(secondOutput);
  });
});
