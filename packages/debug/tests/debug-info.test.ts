import { describe } from "vitest";

import Debug, { type DebugInfoArgs } from "../src/debug.js";
import { createRecordsTest } from "./_helpers.js";

const test = createRecordsTest();

/**
 * 既定のデバッグ情報の引数を組み立てます。
 * 型名と大きさの検証ではデータだけを差し替えるために使用します。
 */
function argsFor(data: unknown): DebugInfoArgs {
  return { vars: {}, action: undefined, key: undefined, direction: "write", data };
}

class Example {}

const TYPE_CASES: readonly {
  readonly name: string;
  readonly data: unknown;
  readonly expected: Record<string, unknown>;
}[] = [
  { name: "null", data: null, expected: { type: "null" } },
  { name: "undefined", data: undefined, expected: { type: "undefined" } },
  { name: "数値", data: 42, expected: { type: "number" } },
  { name: "bigint", data: 42n, expected: { type: "bigint" } },
  { name: "シンボル", data: Symbol("value"), expected: { type: "symbol" } },
  { name: "真偽値", data: true, expected: { type: "boolean" } },
  { name: "関数", data: () => 1, expected: { type: "function" } },
  { name: "プレーンオブジェクト", data: { a: 1 }, expected: { type: "Object" } },
  { name: "配列", data: [1, 2], expected: { type: "Array" } },
  { name: "Map", data: new Map(), expected: { type: "Map" } },
  { name: "Date", data: new Date(0), expected: { type: "Date" } },
  { name: "正規表現", data: /x/, expected: { type: "RegExp" } },
  { name: "Error", data: new Error("x"), expected: { type: "Error" } },
  { name: "クラスインスタンス", data: new Example(), expected: { type: "Example" } },
];

const STRING_CASES: readonly {
  readonly name: string;
  readonly data: string;
  readonly length: number;
}[] = [
  { name: "ASCII 文字列", data: "hello", length: 5 },
  { name: "空文字列", data: "", length: 0 },
  { name: "サロゲートペア", data: "😀", length: 2 },
  { name: "サロゲートペアを含む文字列", data: "a😀b", length: 4 },
  { name: "ゼロ幅接合子で結合された絵文字", data: "👨‍👩‍👧‍👦", length: 11 },
];

const VIEW_CASES: readonly {
  readonly name: string;
  readonly type: string;
  readonly data: ArrayBufferView;
  readonly byteLength: number;
}[] = [
  { name: "Uint8Array", type: "Uint8Array", data: new Uint8Array([1, 2, 3]), byteLength: 3 },
  { name: "Uint16Array", type: "Uint16Array", data: new Uint16Array(3), byteLength: 6 },
  { name: "Float32Array", type: "Float32Array", data: new Float32Array(3), byteLength: 12 },
  { name: "DataView", type: "DataView", data: new DataView(new ArrayBuffer(8)), byteLength: 8 },
  { name: "空の Uint8Array", type: "Uint8Array", data: new Uint8Array(0), byteLength: 0 },
];

describe("Debug.getDefaultDebugInfo", () => {
  test.for(TYPE_CASES)("$name の型名を返す", ({ data, expected }, { expect }) => {
    // 実行と検証
    expect(Debug.getDefaultDebugInfo(argsFor(data))).toStrictEqual(expected);
  });

  test.for(STRING_CASES)(
    "$name は UTF-16 コード単位の長さを返す",
    ({ data, length }, { expect }) => {
      // 実行と検証
      expect(Debug.getDefaultDebugInfo(argsFor(data))).toStrictEqual({ type: "string", length });
    },
  );

  test.for(VIEW_CASES)(
    "$name は要素数ではなくバイト数を返す",
    ({ type, data, byteLength }, { expect }) => {
      // 実行と検証
      expect(Debug.getDefaultDebugInfo(argsFor(data))).toStrictEqual({ type, byteLength });
    },
  );

  test("ArrayBuffer はビューではないためバイト数を返さない", ({ expect }) => {
    // 実行と検証
    expect(Debug.getDefaultDebugInfo(argsFor(new ArrayBuffer(8)))).toStrictEqual({
      type: "ArrayBuffer",
    });
  });

  test("this に依存せず呼び出せる", ({ expect }) => {
    // 準備
    const getDefaultDebugInfo = Debug.getDefaultDebugInfo;

    // 実行と検証
    expect(getDefaultDebugInfo(argsFor("abc"))).toStrictEqual({ type: "string", length: 3 });
  });
});

describe("追加のデバッグ情報", () => {
  test("コールバックの戻り値を action/key/direction とともに記録する", ({ expect, records }) => {
    // 準備
    const debug = new Debug({ getDebugInfo: () => ({ custom: 1 }) });

    // 実行
    debug.encode({ vars: { "unikvs:action": "set", "unikvs:key": "k" }, data: "d" });

    // 検証
    expect(records).toHaveLength(1);
    expect(records[0]!.properties).toStrictEqual({
      custom: 1,
      action: "set",
      key: "k",
      direction: "write",
    });
  });

  test("コールバックが action/key/direction を返しても実際の値が優先される", ({
    expect,
    records,
  }) => {
    // 準備
    const debug = new Debug({
      getDebugInfo: () => ({ action: "fake", key: "fake", direction: "read", custom: 1 }),
    });

    // 実行
    debug.encode({ vars: { "unikvs:action": "set", "unikvs:key": "real" }, data: "d" });

    // 検証
    expect(records).toHaveLength(1);
    expect(records[0]!.properties).toStrictEqual({
      custom: 1,
      action: "set",
      key: "real",
      direction: "write",
    });
  });

  test("コールバックの戻り値は既定の情報を置き換える", ({ expect, records }) => {
    // 準備
    const debug = new Debug({ getDebugInfo: () => ({ custom: 1 }) });

    // 実行
    debug.encode({ vars: { "unikvs:action": "set", "unikvs:key": "k" }, data: "hello" });

    // 検証
    expect(records).toHaveLength(1);
    expect(records[0]!.properties).not.toHaveProperty("type");
    expect(records[0]!.properties).not.toHaveProperty("length");
  });

  test("既定の情報に独自の情報を追加できる", ({ expect, records }) => {
    // 準備
    const debug = new Debug({
      getDebugInfo: (args) => ({ ...Debug.getDefaultDebugInfo(args), preview: "he" }),
    });

    // 実行
    debug.encode({ vars: { "unikvs:action": "set", "unikvs:key": "k" }, data: "hello" });

    // 検証
    expect(records).toHaveLength(1);
    expect(records[0]!.properties).toStrictEqual({
      type: "string",
      length: 5,
      preview: "he",
      action: "set",
      key: "k",
      direction: "write",
    });
  });
});
