import type { IMiddleware } from "@unikvs/core";
import {
  createNext,
  sourceFrom,
  createDecodeContext,
  createEncodeContext,
  createDecodeStreamContext,
  createEncodeStreamContext,
} from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

import Debug from "../src/debug.js";
import { decode, encode } from "./_helpers.js";

const TRANSPARENT_VALUES: readonly {
  readonly name: string;
  readonly value: unknown;
}[] = [
  {
    name: "文字列",
    value: "hello",
  },
  {
    name: "空文字列",
    value: "",
  },
  {
    name: "数値",
    value: 42,
  },
  {
    name: "負のゼロ",
    value: -0,
  },
  {
    name: "NaN",
    value: Number.NaN,
  },
  {
    name: "Infinity",
    value: Number.POSITIVE_INFINITY,
  },
  {
    name: "bigint",
    value: 42n,
  },
  {
    name: "true",
    value: true,
  },
  {
    name: "false",
    value: false,
  },
  {
    name: "null",
    value: null,
  },
  {
    name: "undefined",
    value: undefined,
  },
  {
    name: "オブジェクト",
    value: { nested: { value: 1 } },
  },
  {
    name: "配列",
    value: [1, 2, 3],
  },
  {
    name: "Uint8Array",
    value: new Uint8Array([1, 2, 3]),
  },
  {
    name: "DataView",
    value: new DataView(new ArrayBuffer(4)),
  },
  {
    name: "関数",
    value: () => 42,
  },
];
describe("データの透過", () => {
  test.for(TRANSPARENT_VALUES)(
    "encode は $name を同一参照で返す",
    async ({ value }, { expect }) => {
      // 準備：
      const debug = new Debug();

      // 実行：
      const output = await encode(debug, value);

      // 検証：
      expect(output).toBe(value);
    },
  );

  test.for(TRANSPARENT_VALUES)(
    "decode は $name を同一参照で返す",
    async ({ value }, { expect }) => {
      // 準備：
      const debug = new Debug();

      // 実行：
      const output = await decode(debug, value);

      // 検証：
      expect(output).toBe(value);
    },
  );

  test("encode と decode はコンテキストの変数を変更しない", async ({ expect }) => {
    // 準備：
    const debug = new Debug();
    const data = new Uint8Array([1, 2, 3]);

    // 実行：
    const encodedContext = createEncodeContext(data, "greeting", { values: { extra: true } });
    await debug.encode(encodedContext as IMiddleware.EncodeContext, createNext());

    const decodedContext = createDecodeContext(data, "greeting", { values: { extra: true } });
    await debug.decode(decodedContext as IMiddleware.DecodeContext, createNext());

    // 検証：
    expect(encodedContext.destination).toBe(data);
    expect(decodedContext.destination).toBe(data);
    expect(encodedContext.get("extra")).toBe(true);
    expect(decodedContext.get("extra")).toBe(true);
  });

  test("データを処理した後も isOpen は true を返す", async ({ expect }) => {
    // 準備：
    const debug = new Debug();

    // 実行：
    await encode(debug, "a");
    await decode(debug, "b");

    const encodeStreamContext = createEncodeStreamContext(sourceFrom(["a"]), "key");
    await debug.encodeStream(encodeStreamContext as IMiddleware.EncodeStreamContext, createNext());

    const decodeStreamContext = createDecodeStreamContext(sourceFrom(["b"]), "key");
    await debug.decodeStream(decodeStreamContext as IMiddleware.DecodeStreamContext, createNext());

    // 検証：
    expect(debug.isOpen).toBe(true);
  });
});
