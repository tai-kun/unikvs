import { describe, test } from "vitest";

import Debug from "../src/debug.js";

const TRANSPARENT_VALUES: readonly { readonly name: string; readonly value: unknown }[] = [
  { name: "文字列", value: "hello" },
  { name: "空文字列", value: "" },
  { name: "数値", value: 42 },
  { name: "負のゼロ", value: -0 },
  { name: "NaN", value: Number.NaN },
  { name: "Infinity", value: Number.POSITIVE_INFINITY },
  { name: "bigint", value: 42n },
  { name: "true", value: true },
  { name: "false", value: false },
  { name: "null", value: null },
  { name: "undefined", value: undefined },
  { name: "オブジェクト", value: { nested: { value: 1 } } },
  { name: "配列", value: [1, 2, 3] },
  { name: "Uint8Array", value: new Uint8Array([1, 2, 3]) },
  { name: "DataView", value: new DataView(new ArrayBuffer(4)) },
  { name: "関数", value: () => 42 },
];

describe("データの透過", () => {
  test.for(TRANSPARENT_VALUES)("encode は $name を同一参照で返す", ({ value }, { expect }) => {
    // 準備
    const debug = new Debug();

    // 実行
    const output = debug.encode({ vars: {}, data: value });

    // 検証
    expect(output).toBe(value);
  });

  test.for(TRANSPARENT_VALUES)("decode は $name を同一参照で返す", ({ value }, { expect }) => {
    // 準備
    const debug = new Debug();

    // 実行
    const output = debug.decode({ vars: {}, data: value });

    // 検証
    expect(output).toBe(value);
  });

  test("encode と decode は vars を変更しない", ({ expect }) => {
    // 準備
    const debug = new Debug();
    const vars = Object.freeze({
      "unikvs:action": "set",
      "unikvs:key": "greeting",
      extra: true,
    });
    const data = new Uint8Array([1, 2, 3]);

    // 実行
    const encoded = debug.encode({ vars, data });
    const decoded = debug.decode({ vars, data });

    // 検証
    expect(encoded).toBe(data);
    expect(decoded).toBe(data);
    expect(vars).toStrictEqual({
      "unikvs:action": "set",
      "unikvs:key": "greeting",
      extra: true,
    });
  });

  test("データを処理した後も isOpen は true を返す", ({ expect }) => {
    // 準備
    const debug = new Debug();

    // 実行
    debug.encode({ vars: {}, data: "a" });
    debug.decode({ vars: {}, data: "b" });
    debug.getEncodable({ vars: {} });
    debug.getDecodable({ vars: {} });

    // 検証
    expect(debug.isOpen).toBe(true);
  });
});
