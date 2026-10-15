import { configureSync, resetSync, type LogRecord } from "@logtape/logtape";
import type { IMiddleware } from "@unikvs/core";
import {
  createDecodeContext,
  createDecodeStreamContext,
  createEncodeContext,
  createEncodeStreamContext,
  createNext,
  readAll,
  sourceFrom,
} from "@unikvs/testing";
import { afterAll, describe, test as vitest } from "vitest";

import Debug from "../src/debug.js";

const records: LogRecord[] = [];

configureSync({
  sinks: {
    test: (record) => {
      records.push(record);
    },
  },
  loggers: [
    {
      category: ["@unikvs/*", "@unikvs/debug"],
      sinks: ["test"],
      lowestLevel: "debug",
    },
  ],
  reset: true,
});

afterAll(() => {
  resetSync();
});

/**
 * 記録されたログをテストごとに空にするフィクスチャーです。
 * Debug トランスフォーマーが出力するプロパティーを検証するために使用します。
 */
const test = vitest.extend<{ records: LogRecord[] }>({
  // oxlint-disable-next-line no-empty-pattern
  async records({}, use) {
    records.length = 0;
    await use(records);
  },
});

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
    // 準備
    const debug = new Debug();

    // 実行と検証
    expect(debug.name).toBe("Debug");
  });

  test("isOpen は常に true を返す", ({ expect }) => {
    // 準備
    const debug = new Debug();

    // 実行と検証
    expect(debug.isOpen).toBe(true);
  });

  test("encode はデータを変換せずにそのまま返す", async ({ expect }) => {
    // 準備
    const debug = new Debug();
    const data = new Uint8Array([1, 2, 3]);

    // 実行
    const output = await encode(debug, data, "key");

    // 検証
    expect(output).toBe(data);
  });

  test("decode はデータを変換せずにそのまま返す", async ({ expect }) => {
    // 準備
    const debug = new Debug();
    const data = new Uint8Array([1, 2, 3]);

    // 実行
    const output = await decode(debug, data, "key");

    // 検証
    expect(output).toBe(data);
  });
});

describe("ログの記録", () => {
  test("encode は操作とキーと文字列長を書き込みとして記録する", async ({ expect, records }) => {
    // 準備
    const debug = new Debug();

    // 実行
    await encode(debug, "hello", "greeting");

    // 検証
    expect(records).toHaveLength(1);
    expect(records[0]!.properties).toMatchObject({
      action: "set",
      key: "greeting",
      direction: "write",
      type: "string",
      length: 5,
    });
  });

  test("decode は操作とキーとバイト数を読み込みとして記録する", async ({ expect, records }) => {
    // 準備
    const debug = new Debug();

    // 実行
    await decode(debug, new Uint16Array(3), "blob");

    // 検証
    expect(records).toHaveLength(1);
    expect(records[0]!.properties).toMatchObject({
      action: "get",
      key: "blob",
      direction: "read",
      type: "Uint16Array",
      byteLength: 6,
    });
  });

  test("空文字のキーでも記録する", async ({ expect, records }) => {
    // 準備
    const debug = new Debug();

    // 実行
    await encode(debug, 42, "");

    // 検証
    expect(records).toHaveLength(1);
    expect(records[0]!.properties).toMatchObject({ action: "set", key: "" });
  });

  test("カスタムのコールバックが返した情報を記録する", async ({ expect, records }) => {
    // 準備
    const debug = new Debug({
      getDebugInfo: ({ data }) => ({ custom: data === "hello" ? "matched" : "unmatched" }),
    });

    // 実行
    await encode(debug, "hello", "foo");

    // 検証
    expect(records).toHaveLength(1);
    expect(records[0]!.properties).toMatchObject({
      direction: "write",
      custom: "matched",
    });
  });

  test("カスタムのコールバックには操作とキーと向きとデータを渡す", async ({ expect, records }) => {
    // 準備
    const received: unknown[] = [];
    const debug = new Debug({
      getDebugInfo: (args) => {
        received.push(args);
        return {};
      },
    });
    const data = new Uint8Array([1]);
    const c = createDecodeContext(data, "foo");

    // 実行
    await debug.decode(c as IMiddleware.DecodeContext, createNext());

    // 検証
    expect(records).toHaveLength(1);
    expect(received).toStrictEqual([{ action: "get", key: "foo", direction: "read", data }]);
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
    // 実行
    const info = Debug.getDefaultDebugInfo({
      action: "set",
      key: "key",
      direction: "write",
      data,
    });

    // 検証
    expect(info).toStrictEqual({ type, ...size });
  });
});

describe("フィルター", () => {
  test("keyFilter に一致するキーだけを記録する", async ({ expect, records }) => {
    // 準備
    const debug = new Debug({ keyFilter: (key) => key === "target" });

    // 実行
    await encode(debug, "a", "target");
    await encode(debug, "b", "other");

    // 検証
    expect(records).toHaveLength(1);
    expect(records[0]!.properties["key"]).toBe("target");
  });

  test("actionFilter に一致する操作だけを記録する", async ({ expect, records }) => {
    // 準備
    const debug = new Debug({ actionFilter: (action) => action === "get" });

    // 実行
    await encode(debug, "a", "foo");
    await decode(debug, "b", "foo");

    // 検証
    expect(records).toHaveLength(1);
    expect(records[0]!.properties["direction"]).toBe("read");
  });

  test("フィルターが拒否した場合は記録しない", async ({ expect, records }) => {
    // 準備
    const debug = new Debug({
      keyFilter: () => false,
      actionFilter: () => false,
    });

    // 実行
    await encode(debug, "a", "foo");
    await decode(debug, "b", "foo");

    // 検証
    expect(records).toHaveLength(0);
  });

  test("フィルターを指定しない場合はすべて記録する", async ({ expect, records }) => {
    // 準備
    const debug = new Debug();

    // 実行
    await encode(debug, "1", "a");
    await decode(debug, "2", "b");
    await encode(debug, "3", "c");

    // 検証
    expect(records).toHaveLength(3);
  });
});

describe("ストリーム", () => {
  test("encodeStream はチャンクごとに書き込みとして記録する", async ({ expect, records }) => {
    // 準備
    const debug = new Debug();
    const input = [new Uint8Array([1]), new Uint8Array([2, 3])];

    // 実行
    const output = await pumpEncode(debug, input, "stream");

    // 検証
    expect(output).toStrictEqual(input);
    expect(records).toHaveLength(2);
    expect(records[0]!.properties).toMatchObject({
      action: "set",
      key: "stream",
      direction: "write",
      byteLength: 1,
    });
    expect(records[1]!.properties).toMatchObject({
      action: "set",
      key: "stream",
      direction: "write",
      byteLength: 2,
    });
  });

  test("decodeStream はチャンクごとに読み込みとして記録する", async ({ expect, records }) => {
    // 準備
    const debug = new Debug();
    const input = ["a", "bc"];

    // 実行
    const output = await pumpDecode(debug, input, "stream");

    // 検証
    expect(output).toStrictEqual(input);
    expect(records).toHaveLength(2);
    expect(records[0]!.properties).toMatchObject({
      action: "stream",
      key: "stream",
      direction: "read",
      type: "string",
      length: 1,
    });
    expect(records[1]!.properties).toMatchObject({
      action: "stream",
      key: "stream",
      direction: "read",
      type: "string",
      length: 2,
    });
  });

  test("ストリームでもフィルターが適用される", async ({ expect, records }) => {
    // 準備
    const debug = new Debug({ keyFilter: (key) => key === "target" });

    // 実行
    await pumpEncode(debug, [new Uint8Array([1])], "other");
    await pumpEncode(debug, [new Uint8Array([2])], "target");

    // 検証
    expect(records).toHaveLength(1);
    expect(records[0]!.properties["key"]).toBe("target");
  });
});
