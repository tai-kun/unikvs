import type { IMiddleware } from "@unikvs/core";
import { createNext, createEncodeContext } from "@unikvs/testing";
import { describe } from "vite-plus/test";

import Debug, { type DebugInfoArgs } from "../src/debug.js";
import { createRecordsTest } from "./_helpers.js";

const test = createRecordsTest();

/**
 * 既定のデバッグ情報の引数を組み立てます。
 * 型名と大きさの検証ではデータだけを差し替えるために使用します。
 */
function argsFor(data: unknown): DebugInfoArgs {
  return {
    key: "key",
    data,
    action: "set",
    direction: "write",
  };
}

/**
 * データを書き込みとして記録し、そのまま返します。
 */
async function encode(debug: Debug, data: unknown, key: string): Promise<unknown> {
  const c = createEncodeContext(data, key);
  await debug.encode(c as IMiddleware.EncodeContext, createNext());

  return c.destination;
}

class Example {
  public value = 1;
}

const TYPE_CASES: readonly {
  readonly data: unknown;
  readonly name: string;
  readonly expected: Record<string, unknown>;
}[] = [
  {
    data: null,
    name: "null",
    expected: { type: "null" },
  },
  {
    data: undefined,
    name: "undefined",
    expected: { type: "undefined" },
  },
  {
    data: 42,
    name: "数値",
    expected: { type: "number" },
  },
  {
    data: 42n,
    name: "bigint",
    expected: { type: "bigint" },
  },
  {
    data: Symbol("value"),
    name: "シンボル",
    expected: { type: "symbol" },
  },
  {
    data: true,
    name: "真偽値",
    expected: { type: "boolean" },
  },
  {
    data: () => 1,
    name: "関数",
    expected: { type: "function" },
  },
  {
    data: { a: 1 },
    name: "プレーンオブジェクト",
    expected: { type: "Object" },
  },
  {
    data: [1, 2],
    name: "配列",
    expected: { type: "Array" },
  },
  {
    data: new Map(),
    name: "Map",
    expected: { type: "Map" },
  },
  {
    data: new Date(0),
    name: "Date",
    expected: { type: "Date" },
  },
  {
    data: /x/u,
    name: "正規表現",
    expected: { type: "RegExp" },
  },
  {
    data: new Error("x"),
    name: "Error",
    expected: { type: "Error" },
  },
  {
    data: new Example(),
    name: "クラスインスタンス",
    expected: { type: "Example" },
  },
];

const STRING_CASES: readonly {
  readonly data: string;
  readonly name: string;
  readonly length: number;
}[] = [
  {
    data: "hello",
    name: "ASCII 文字列",
    length: 5,
  },
  {
    data: "",
    name: "空文字列",
    length: 0,
  },
  {
    data: "😀",
    name: "サロゲートペア",
    length: 2,
  },
  {
    data: "a😀b",
    name: "サロゲートペアを含む文字列",
    length: 4,
  },
  {
    data: "👨‍👩‍👧‍👦",
    name: "ゼロ幅接合子で結合された絵文字",
    length: 11,
  },
];

const VIEW_CASES: readonly {
  readonly data: ArrayBufferView;
  readonly name: string;
  readonly type: string;
  readonly byteLength: number;
}[] = [
  {
    data: new Uint8Array([1, 2, 3]),
    name: "Uint8Array",
    type: "Uint8Array",
    byteLength: 3,
  },
  {
    data: new Uint16Array(3),
    name: "Uint16Array",
    type: "Uint16Array",
    byteLength: 6,
  },
  {
    data: new Float32Array(3),
    name: "Float32Array",
    type: "Float32Array",
    byteLength: 12,
  },
  {
    data: new DataView(new ArrayBuffer(8)),
    name: "DataView",
    type: "DataView",
    byteLength: 8,
  },
  {
    data: new Uint8Array(0),
    name: "空の Uint8Array",
    type: "Uint8Array",
    byteLength: 0,
  },
];
describe("Debug.getDefaultDebugInfo", () => {
  test.for(TYPE_CASES)("$name の型名を返す", ({ data, expected }, { expect }) => {
    // 実行と検証：
    expect(Debug.getDefaultDebugInfo(argsFor(data))).toStrictEqual(expected);
  });

  test.for(STRING_CASES)(
    "$name は UTF-16 コード単位の長さを返す",
    ({ data, length }, { expect }) => {
      // 実行と検証：
      expect(Debug.getDefaultDebugInfo(argsFor(data))).toStrictEqual({
        type: "string",
        length,
      });
    },
  );

  test.for(VIEW_CASES)(
    "$name は要素数ではなくバイト数を返す",
    ({ data, type, byteLength }, { expect }) => {
      // 実行と検証：
      expect(Debug.getDefaultDebugInfo(argsFor(data))).toStrictEqual({
        type,
        byteLength,
      });
    },
  );

  test("ArrayBuffer はビューではないためバイト数を返さない", ({ expect }) => {
    // 実行と検証：
    expect(Debug.getDefaultDebugInfo(argsFor(new ArrayBuffer(8)))).toStrictEqual({
      type: "ArrayBuffer",
    });
  });

  test("this に依存せず呼び出せる", ({ expect }) => {
    // 準備：
    const getDefaultDebugInfo = Debug.getDefaultDebugInfo;

    // 実行と検証：
    expect(getDefaultDebugInfo(argsFor("abc"))).toStrictEqual({
      type: "string",
      length: 3,
    });
  });
});

describe("追加のデバッグ情報", () => {
  test("コールバックの戻り値を action/key/direction とともに記録する", async ({
    expect,
    records,
  }) => {
    // 準備：
    const debug = new Debug({ getDebugInfo: (): Record<string, unknown> => ({ custom: 1 }) });

    // 実行：
    await encode(debug, "d", "k");

    // 検証：
    expect(records).toHaveLength(1);
    expect(records.at(0)?.properties).toStrictEqual({
      key: "k",
      action: "set",
      custom: 1,
      direction: "write",
    });
  });

  test("コールバックが action/key/direction を返しても実際の値が優先される", async ({
    expect,
    records,
  }) => {
    // 準備：
    const debug = new Debug({
      getDebugInfo: (): Record<string, unknown> => ({
        key: "fake",
        action: "fake",
        custom: 1,
        direction: "read",
      }),
    });

    // 実行：
    await encode(debug, "d", "real");

    // 検証：
    expect(records).toHaveLength(1);
    expect(records.at(0)?.properties).toStrictEqual({
      key: "real",
      action: "set",
      custom: 1,
      direction: "write",
    });
  });

  test("コールバックの戻り値は既定の情報を置き換える", async ({ expect, records }) => {
    // 準備：
    const debug = new Debug({ getDebugInfo: (): Record<string, unknown> => ({ custom: 1 }) });

    // 実行：
    await encode(debug, "hello", "k");

    // 検証：
    expect(records).toHaveLength(1);
    expect(records.at(0)?.properties).not.toHaveProperty("type");
    expect(records.at(0)?.properties).not.toHaveProperty("length");
  });

  test("既定の情報に独自の情報を追加できる", async ({ expect, records }) => {
    // 準備：
    const debug = new Debug({
      getDebugInfo: (args): Record<string, unknown> => ({
        ...Debug.getDefaultDebugInfo(args),
        preview: "he",
      }),
    });

    // 実行：
    await encode(debug, "hello", "k");

    // 検証：
    expect(records).toHaveLength(1);
    expect(records.at(0)?.properties).toStrictEqual({
      key: "k",
      type: "string",
      action: "set",
      length: 5,
      preview: "he",
      direction: "write",
    });
  });
});
