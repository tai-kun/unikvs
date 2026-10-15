import type { IMiddleware } from "@unikvs/core";
import { createDecodeContext, createEncodeContext, createNext } from "@unikvs/testing";
import { describe } from "vitest";

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

describe("ログのメタデータ", () => {
  test("encode は書き込みとしてロガーとレベルとメッセージを記録する", async ({
    expect,
    records,
  }) => {
    // 準備
    const debug = new Debug();

    // 実行
    await encode(debug, "hello", "greeting");

    // 検証
    expect(records).toHaveLength(1);
    expect(records[0]!.category).toStrictEqual(["@unikvs/*", "@unikvs/debug"]);
    expect(records[0]!.level).toBe("debug");
    expect(records[0]!.properties["direction"]).toBe("write");
    expect(records[0]!.message).toStrictEqual([
      "Data was written: action=",
      "set",
      ", key=",
      "greeting",
      "",
    ]);
  });

  test("decode は読み込みとしてロガーとレベルとメッセージを記録する", async ({
    expect,
    records,
  }) => {
    // 準備
    const debug = new Debug();

    // 実行
    await decode(debug, "hello", "greeting");

    // 検証
    expect(records).toHaveLength(1);
    expect(records[0]!.category).toStrictEqual(["@unikvs/*", "@unikvs/debug"]);
    expect(records[0]!.level).toBe("debug");
    expect(records[0]!.properties["direction"]).toBe("read");
    expect(records[0]!.message).toStrictEqual([
      "Data was read: action=",
      "get",
      ", key=",
      "greeting",
      "",
    ]);
  });
});
