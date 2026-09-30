import { configureSync, resetSync, type LogRecord } from "@logtape/logtape";
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
      category: ["unikvs", "@unikvs/debug"],
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
 * TransformStream にチャンクを順に流し込み、出力されたチャンクを返します。
 * ストリーム経由でもログが記録されることを検証するために使用します。
 */
async function pipeChunks<T>(stream: TransformStream<T, T>, chunks: readonly T[]): Promise<T[]> {
  const readable = new ReadableStream<T>({
    start: (controller) => {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
  const reader = readable.pipeThrough(stream).getReader();
  const output: T[] = [];

  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    output.push(value);
  }

  return output;
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

  test("encode はデータを変換せずにそのまま返す", ({ expect }) => {
    // 準備
    const debug = new Debug();
    const data = new Uint8Array([1, 2, 3]);

    // 実行
    const output = debug.encode({ vars: {}, data });

    // 検証
    expect(output).toBe(data);
  });

  test("decode はデータを変換せずにそのまま返す", ({ expect }) => {
    // 準備
    const debug = new Debug();
    const data = new Uint8Array([1, 2, 3]);

    // 実行
    const output = debug.decode({ vars: {}, data });

    // 検証
    expect(output).toBe(data);
  });
});

describe("ログの記録", () => {
  test("encode は操作とキーと文字列長を書き込みとして記録する", ({ expect, records }) => {
    // 準備
    const debug = new Debug();
    const vars = { "unikvs:action": "set", "unikvs:key": "greeting" };

    // 実行
    debug.encode({ vars, data: "hello" });

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

  test("decode は操作とキーとバイト数を読み込みとして記録する", ({ expect, records }) => {
    // 準備
    const debug = new Debug();
    const vars = { "unikvs:action": "get", "unikvs:key": "blob" };

    // 実行
    debug.decode({ vars, data: new Uint16Array(3) });

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

  test("操作とキーが変数にない場合は記録しない", ({ expect, records }) => {
    // 準備
    const debug = new Debug();

    // 実行
    debug.encode({ vars: {}, data: 42 });
    debug.encode({ vars: { "unikvs:action": "set" }, data: 42 });
    debug.encode({ vars: { "unikvs:key": "foo" }, data: 42 });

    // 検証
    expect(records).toHaveLength(0);
  });

  test("カスタムのコールバックが返した情報を記録する", ({ expect, records }) => {
    // 準備
    const debug = new Debug({
      getDebugInfo: ({ data }) => ({ custom: data === "hello" ? "matched" : "unmatched" }),
    });

    // 実行
    debug.encode({ vars: { "unikvs:action": "set", "unikvs:key": "foo" }, data: "hello" });

    // 検証
    expect(records).toHaveLength(1);
    expect(records[0]!.properties).toMatchObject({
      direction: "write",
      custom: "matched",
    });
  });

  test("カスタムのコールバックには変数と操作とキーと向きとデータを渡す", ({ expect, records }) => {
    // 準備
    const received: unknown[] = [];
    const debug = new Debug({
      getDebugInfo: (args) => {
        received.push(args);
        return {};
      },
    });
    const vars = { "unikvs:action": "get", "unikvs:key": "foo", extra: true };
    const data = new Uint8Array([1]);

    // 実行
    debug.decode({ vars, data });

    // 検証
    expect(records).toHaveLength(1);
    expect(received).toStrictEqual([{ vars, action: "get", key: "foo", direction: "read", data }]);
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
      vars: {},
      action: undefined,
      key: undefined,
      direction: "write",
      data,
    });

    // 検証
    expect(info).toStrictEqual({ type, ...size });
  });
});

describe("フィルター", () => {
  test("keyFilter に一致するキーだけを記録する", ({ expect, records }) => {
    // 準備
    const debug = new Debug({ keyFilter: (key) => key === "target" });

    // 実行
    debug.encode({ vars: { "unikvs:action": "set", "unikvs:key": "target" }, data: "a" });
    debug.encode({ vars: { "unikvs:action": "set", "unikvs:key": "other" }, data: "b" });

    // 検証
    expect(records).toHaveLength(1);
    expect(records[0]!.properties["key"]).toBe("target");
  });

  test("actionFilter に一致する操作だけを記録する", ({ expect, records }) => {
    // 準備
    const debug = new Debug({ actionFilter: (action) => action === "get" });

    // 実行
    debug.encode({ vars: { "unikvs:action": "set", "unikvs:key": "foo" }, data: "a" });
    debug.decode({ vars: { "unikvs:action": "get", "unikvs:key": "foo" }, data: "b" });

    // 検証
    expect(records).toHaveLength(1);
    expect(records[0]!.properties["direction"]).toBe("read");
  });

  test("フィルターが指定されているとき、対応する変数がないログは記録しない", ({
    expect,
    records,
  }) => {
    // 準備
    const debug = new Debug({
      keyFilter: () => true,
      actionFilter: () => true,
    });

    // 実行
    debug.encode({ vars: {}, data: "a" });
    debug.encode({ vars: { "unikvs:action": "set" }, data: "b" });
    debug.encode({ vars: { "unikvs:key": "foo" }, data: "c" });

    // 検証
    expect(records).toHaveLength(0);
  });

  test("フィルターを指定しない場合はすべて記録する", ({ expect, records }) => {
    // 準備
    const debug = new Debug();

    // 実行
    debug.encode({ vars: { "unikvs:action": "set", "unikvs:key": "a" }, data: "1" });
    debug.decode({ vars: { "unikvs:action": "get", "unikvs:key": "b" }, data: "2" });
    debug.encode({ vars: { "unikvs:action": "set", "unikvs:key": "c" }, data: "3" });

    // 検証
    expect(records).toHaveLength(3);
  });
});

describe("ストリーム", () => {
  test("getEncodable はチャンクごとに書き込みとして記録する", async ({ expect, records }) => {
    // 準備
    const debug = new Debug();
    const vars = { "unikvs:action": "set", "unikvs:key": "stream" };
    const input = [new Uint8Array([1]), new Uint8Array([2, 3])];

    // 実行
    const output = await pipeChunks(debug.getEncodable({ vars }), input);

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

  test("getDecodable はチャンクごとに読み込みとして記録する", async ({ expect, records }) => {
    // 準備
    const debug = new Debug();
    const vars = { "unikvs:action": "stream", "unikvs:key": "stream" };
    const input = ["a", "bc"];

    // 実行
    const output = await pipeChunks(debug.getDecodable({ vars }), input);

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
    await pipeChunks(
      debug.getEncodable({ vars: { "unikvs:action": "set", "unikvs:key": "other" } }),
      [new Uint8Array([1])],
    );
    await pipeChunks(
      debug.getEncodable({ vars: { "unikvs:action": "set", "unikvs:key": "target" } }),
      [new Uint8Array([2])],
    );

    // 検証
    expect(records).toHaveLength(1);
    expect(records[0]!.properties["key"]).toBe("target");
  });
});
