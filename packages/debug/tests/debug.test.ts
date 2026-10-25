import type { IMiddleware } from "@unikvs/core";
import {
  readAll,
  createNext,
  sourceFrom,
  createDecodeContext,
  createEncodeContext,
  createDecodeStreamContext,
  createEncodeStreamContext,
} from "@unikvs/testing";
import { describe } from "vite-plus/test";

import Debug from "../src/debug.js";
import { createRecordsTest } from "./_helpers.js";

const test = createRecordsTest();

/**
 * データを書き込みとして記録し、そのまま返します。
 */
async function encode(debug: Debug, data: unknown, key: string): Promise<unknown> {
  const c = createEncodeContext(data, key);
  await debug.encode(c as IMiddleware.EncodeContext, createNext());

  return c.destination;
}

/**
 * データを読み込みとして記録し、そのまま返します。
 */
async function decode(debug: Debug, data: unknown, key: string): Promise<unknown> {
  const c = createDecodeContext(data, key);
  await debug.decode(c as IMiddleware.DecodeContext, createNext());

  return c.destination;
}

/**
 * チャンク列を書き込みストリームに流し、出力されたチャンクを返します。
 * ストリーム経由でもログが記録されることを検証するために使用します。
 */
async function pumpEncode(
  debug: Debug,
  chunks: readonly unknown[],
  key: string,
): Promise<unknown[]> {
  const c = createEncodeStreamContext(sourceFrom(chunks), key);
  await debug.encodeStream(c as IMiddleware.EncodeStreamContext, createNext());

  return readAll(c.destination as ReadableStream<unknown>);
}

/**
 * チャンク列を読み込みストリームに流し、出力されたチャンクを返します。
 * ストリーム経由でもログが記録されることを検証するために使用します。
 */
async function pumpDecode(
  debug: Debug,
  chunks: readonly unknown[],
  key: string,
): Promise<unknown[]> {
  const c = createDecodeStreamContext(sourceFrom(chunks), key);
  await debug.decodeStream(c as IMiddleware.DecodeStreamContext, createNext());

  return readAll(c.destination as ReadableStream<unknown>);
}

describe("初期化と基本属性", () => {
  test("name プロパティは Debug を返す", ({ expect }) => {
    // 準備：
    const debug = new Debug();

    // 実行と検証：
    expect(debug.name).toBe("Debug");
  });

  test("isOpen は常に true を返す", ({ expect }) => {
    // 準備：
    const debug = new Debug();

    // 実行と検証：
    expect(debug.isOpen).toBe(true);
  });

  test("encode はデータを変換せずにそのまま返す", async ({ expect }) => {
    // 準備：
    const debug = new Debug();
    const data = new Uint8Array([1, 2, 3]);

    // 実行：
    const output = await encode(debug, data, "key");

    // 検証：
    expect(output).toBe(data);
  });

  test("decode はデータを変換せずにそのまま返す", async ({ expect }) => {
    // 準備：
    const debug = new Debug();
    const data = new Uint8Array([1, 2, 3]);

    // 実行：
    const output = await decode(debug, data, "key");

    // 検証：
    expect(output).toBe(data);
  });
});

describe("ログの記録", () => {
  test("encode は操作とキーと文字列長を書き込みとして記録する", async ({ expect, records }) => {
    // 準備：
    const debug = new Debug();

    // 実行：
    await encode(debug, "hello", "greeting");

    // 検証：
    expect(records).toHaveLength(1);
    expect(records.at(0)?.properties).toMatchObject({
      key: "greeting",
      type: "string",
      action: "set",
      length: 5,
      direction: "write",
    });
  });

  test("decode は操作とキーとバイト数を読み込みとして記録する", async ({ expect, records }) => {
    // 準備：
    const debug = new Debug();

    // 実行：
    await decode(debug, new Uint16Array(3), "blob");

    // 検証：
    expect(records).toHaveLength(1);
    expect(records.at(0)?.properties).toMatchObject({
      key: "blob",
      type: "Uint16Array",
      action: "get",
      direction: "read",
      byteLength: 6,
    });
  });

  test("空文字のキーでも記録する", async ({ expect, records }) => {
    // 準備：
    const debug = new Debug();

    // 実行：
    await encode(debug, 42, "");

    // 検証：
    expect(records).toHaveLength(1);
    expect(records.at(0)?.properties).toMatchObject({
      key: "",
      action: "set",
    });
  });

  test("カスタムのコールバックが返した情報を記録する", async ({ expect, records }) => {
    // 準備：
    const debug = new Debug({
      getDebugInfo: (): Record<string, unknown> => ({ custom: "matched" }),
    });

    // 実行：
    await encode(debug, "hello", "foo");

    // 検証：
    expect(records).toHaveLength(1);
    expect(records.at(0)?.properties).toMatchObject({
      custom: "matched",
      direction: "write",
    });
  });

  test("カスタムのコールバックには操作とキーと向きとデータを渡す", async ({ expect, records }) => {
    // 準備：
    const received: unknown[] = [];
    const debug = new Debug({
      getDebugInfo: (args): Record<string, unknown> => {
        received.push(args);

        return {};
      },
    });
    const data = new Uint8Array([1]);
    const c = createDecodeContext(data, "foo");

    // 実行：
    await debug.decode(c as IMiddleware.DecodeContext, createNext());

    // 検証：
    expect(records).toHaveLength(1);
    expect(received).toStrictEqual([
      {
        key: "foo",
        data,
        action: "get",
        direction: "read",
      },
    ]);
  });
});

describe("既定のデバッグ情報", () => {
  test.for([
    ["hello", "string", { length: 5 }],
    ["", "string", { length: 0 }],
    [123, "number", {}],
    [true, "boolean", {}],
    [null, "null", {}],
    [{ a: 1 }, "Object", {}],
    [new Uint8Array([1, 2, 3]), "Uint8Array", { byteLength: 3 }],
    [new Float64Array(2), "Float64Array", { byteLength: 16 }],
    [new DataView(new ArrayBuffer(8)), "DataView", { byteLength: 8 }],
  ] as const)("%o の型と大きさを返す", ([data, type, size], { expect }) => {
    // 実行：
    const info = Debug.getDefaultDebugInfo({
      key: "key",
      data,
      action: "set",
      direction: "write",
    });

    // 検証：
    expect(info).toStrictEqual({
      type,
      ...size,
    });
  });
});

describe("フィルター", () => {
  test("keyFilter に一致するキーだけを記録する", async ({ expect, records }) => {
    // 準備：
    const debug = new Debug({ keyFilter: (key): boolean => key === "target" });

    // 実行：
    await encode(debug, "a", "target");
    await encode(debug, "b", "other");

    // 検証：
    expect(records).toHaveLength(1);
    expect(records.at(0)?.properties["key"]).toBe("target");
  });

  test("actionFilter に一致する操作だけを記録する", async ({ expect, records }) => {
    // 準備：
    const debug = new Debug({ actionFilter: (action): boolean => action === "get" });

    // 実行：
    await encode(debug, "a", "foo");
    await decode(debug, "b", "foo");

    // 検証：
    expect(records).toHaveLength(1);
    expect(records.at(0)?.properties["direction"]).toBe("read");
  });

  test("フィルターが拒否した場合は記録しない", async ({ expect, records }) => {
    // 準備：
    const debug = new Debug({
      keyFilter: (): boolean => false,
      actionFilter: (): boolean => false,
    });

    // 実行：
    await encode(debug, "a", "foo");
    await decode(debug, "b", "foo");

    // 検証：
    expect(records).toHaveLength(0);
  });

  test("フィルターを指定しない場合はすべて記録する", async ({ expect, records }) => {
    // 準備：
    const debug = new Debug();

    // 実行：
    await encode(debug, "1", "a");
    await decode(debug, "2", "b");
    await encode(debug, "3", "c");

    // 検証：
    expect(records).toHaveLength(3);
  });
});

describe("ストリーム", () => {
  test("encodeStream はチャンクごとに書き込みとして記録する", async ({ expect, records }) => {
    // 準備：
    const debug = new Debug();
    const input = [new Uint8Array([1]), new Uint8Array([2, 3])];

    // 実行：
    const output = await pumpEncode(debug, input, "stream");

    // 検証：
    expect(output).toStrictEqual(input);

    expect(records).toHaveLength(2);
    expect(records.at(0)?.properties).toMatchObject({
      key: "stream",
      action: "set",
      direction: "write",
      byteLength: 1,
    });
    expect(records.at(1)?.properties).toMatchObject({
      key: "stream",
      action: "set",
      direction: "write",
      byteLength: 2,
    });
  });

  test("decodeStream はチャンクごとに読み込みとして記録する", async ({ expect, records }) => {
    // 準備：
    const debug = new Debug();
    const input = ["a", "bc"];

    // 実行：
    const output = await pumpDecode(debug, input, "stream");

    // 検証：
    expect(output).toStrictEqual(input);

    expect(records).toHaveLength(2);
    expect(records.at(0)?.properties).toMatchObject({
      key: "stream",
      type: "string",
      action: "stream",
      length: 1,
      direction: "read",
    });
    expect(records.at(1)?.properties).toMatchObject({
      key: "stream",
      type: "string",
      action: "stream",
      length: 2,
      direction: "read",
    });
  });

  test("ストリームでもフィルターが適用される", async ({ expect, records }) => {
    // 準備：
    const debug = new Debug({ keyFilter: (key): boolean => key === "target" });

    // 実行：
    await pumpEncode(debug, [new Uint8Array([1])], "other");
    await pumpEncode(debug, [new Uint8Array([2])], "target");

    // 検証：
    expect(records).toHaveLength(1);
    expect(records.at(0)?.properties["key"]).toBe("target");
  });
});
