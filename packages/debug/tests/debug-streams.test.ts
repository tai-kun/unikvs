import type { IMiddleware } from "@unikvs/core";
import {
  createDecodeStreamContext,
  createEncodeStreamContext,
  createNext,
  readAll,
  sourceFrom,
} from "@unikvs/testing";
import { describe } from "vitest";

import Debug from "../src/debug.js";
import { createRecordsTest } from "./_helpers.js";

const test = createRecordsTest();

/**
 * チャンク列を書き込みストリームに流し、出力されたチャンクを返します。
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

describe("ストリームのチャンク", () => {
  test("チャンクが 0 個のときは何も記録しない", async ({ expect, records }) => {
    // 準備
    const debug = new Debug();

    // 実行
    const encoded = await pumpEncode(debug, [], "stream");
    const decoded = await pumpDecode(debug, [], "stream");

    // 検証
    expect(encoded).toStrictEqual([]);
    expect(decoded).toStrictEqual([]);
    expect(records).toHaveLength(0);
  });

  test("チャンクが 1 個のときは 1 件だけ記録する", async ({ expect, records }) => {
    // 準備
    const debug = new Debug();

    // 実行
    const encoded = await pumpEncode(debug, ["a"], "stream");
    const decoded = await pumpDecode(debug, ["b"], "stream");

    // 検証
    expect(encoded).toStrictEqual(["a"]);
    expect(decoded).toStrictEqual(["b"]);
    expect(records).toHaveLength(2);
    expect(records[0]!.properties["direction"]).toBe("write");
    expect(records[1]!.properties["direction"]).toBe("read");
  });

  test("複数のチャンクが混在した型でも同一参照で順に流れる", async ({ expect, records }) => {
    // 準備
    const debug = new Debug();
    const chunks: unknown[] = [
      "a",
      42,
      42n,
      true,
      null,
      undefined,
      { nested: true },
      [1, 2],
      new Uint8Array([1]),
      new DataView(new ArrayBuffer(1)),
      () => 1,
    ];

    // 実行
    const output = await pumpDecode(debug, chunks, "stream");

    // 検証
    expect(output).toHaveLength(chunks.length);
    for (const [index, chunk] of chunks.entries()) {
      expect(output[index]).toBe(chunk);
    }
    expect(records).toHaveLength(chunks.length);
    expect(records.every((record) => record.properties["direction"] === "read")).toBe(true);
  });

  test("フィルターはチャンクごとに適用される", async ({ expect, records }) => {
    // 準備
    const debug = new Debug({ actionFilter: (action) => action === "stream" });

    // 実行
    await pumpDecode(debug, ["a", "b", "c"], "stream");
    await pumpEncode(debug, ["d"], "stream");

    // 検証
    expect(records).toHaveLength(3);
    expect(records.every((record) => record.properties["action"] === "stream")).toBe(true);
  });
});

describe("ストリームのエラー", () => {
  test("上流のエラーが出力側へ伝播する", async ({ expect, records }) => {
    // 準備
    const debug = new Debug();
    const source = new ReadableStream<string>({
      start: (controller) => {
        controller.error(new Error("upstream failure"));
      },
    });

    // 実行
    const c = createEncodeStreamContext(source, "stream");
    await debug.encodeStream(c as IMiddleware.EncodeStreamContext, createNext());
    const reader = (c.destination as ReadableStream<string>).getReader();

    // 検証
    await expect(reader.read()).rejects.toThrow("upstream failure");
    expect(records).toHaveLength(0);
  });

  test("下流のエラーが出力側へ伝播する", async ({ expect, records }) => {
    // 準備
    const debug = new Debug();
    const failing = new TransformStream<string, string>({
      transform() {
        throw new Error("downstream failure");
      },
    });

    // 実行
    const c = createDecodeStreamContext(sourceFrom(["a"]), "stream");
    await debug.decodeStream(c as IMiddleware.DecodeStreamContext, createNext());
    const reader = (c.destination as ReadableStream<string>).pipeThrough(failing).getReader();

    // 検証
    await expect(reader.read()).rejects.toThrow("downstream failure");
    expect(records).toHaveLength(1);
    expect(records[0]!.properties["direction"]).toBe("read");
  });
});

describe("ストリームのキャンセル", () => {
  test("読み取りをキャンセルすると上流のソースもキャンセルされる", async ({ expect, records }) => {
    // 準備
    const debug = new Debug();
    let cancelReason: unknown;
    const source = new ReadableStream<string>({
      start: (controller) => {
        controller.enqueue("a");
      },
      cancel(reason) {
        cancelReason = reason;
      },
    });

    // 実行
    const c = createDecodeStreamContext(source, "stream");
    await debug.decodeStream(c as IMiddleware.DecodeStreamContext, createNext());
    const reader = (c.destination as ReadableStream<string>).getReader();
    await expect(reader.read()).resolves.toStrictEqual({ done: false, value: "a" });
    await reader.cancel("stop");
    // キャンセルは非同期に上流へ伝播するため、伝播の完了を待ちます。
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    // 検証
    expect(cancelReason).toBe("stop");
    expect(records).toHaveLength(1);
  });
});
