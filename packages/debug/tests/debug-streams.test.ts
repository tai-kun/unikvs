import { describe } from "vitest";

import Debug from "../src/debug.js";
import { createRecordsTest, pipeChunks } from "./_helpers.js";

const test = createRecordsTest();

const WRITE_VARS = { "unikvs:action": "set", "unikvs:key": "stream" };
const READ_VARS = { "unikvs:action": "stream", "unikvs:key": "stream" };

describe("ストリームのチャンク", () => {
  test("チャンクが 0 個のときは何も記録しない", async ({ expect, records }) => {
    // 準備
    const debug = new Debug();

    // 実行
    const encoded = await pipeChunks<unknown>(debug.getEncodable({ vars: WRITE_VARS }), []);
    const decoded = await pipeChunks<unknown>(debug.getDecodable({ vars: READ_VARS }), []);

    // 検証
    expect(encoded).toStrictEqual([]);
    expect(decoded).toStrictEqual([]);
    expect(records).toHaveLength(0);
  });

  test("チャンクが 1 個のときは 1 件だけ記録する", async ({ expect, records }) => {
    // 準備
    const debug = new Debug();

    // 実行
    const encoded = await pipeChunks(debug.getEncodable({ vars: WRITE_VARS }), ["a"]);
    const decoded = await pipeChunks(debug.getDecodable({ vars: READ_VARS }), ["b"]);

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
    const output = await pipeChunks<unknown>(debug.getDecodable({ vars: READ_VARS }), chunks);

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
    await pipeChunks(debug.getDecodable({ vars: READ_VARS }), ["a", "b", "c"]);
    await pipeChunks(debug.getDecodable({ vars: WRITE_VARS }), ["d"]);

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
    const reader = source.pipeThrough(debug.getEncodable({ vars: WRITE_VARS })).getReader();

    // 検証
    await expect(reader.read()).rejects.toThrow("upstream failure");
    expect(records).toHaveLength(0);
  });

  test("下流のエラーが出力側へ伝播する", async ({ expect, records }) => {
    // 準備
    const debug = new Debug();
    const source = new ReadableStream<string>({
      start: (controller) => {
        controller.enqueue("a");
        controller.close();
      },
    });
    const failing = new TransformStream<string, string>({
      transform() {
        throw new Error("downstream failure");
      },
    });

    // 実行
    const reader = source
      .pipeThrough(debug.getDecodable({ vars: READ_VARS }))
      .pipeThrough(failing)
      .getReader();

    // 検証
    await expect(reader.read()).rejects.toThrow("downstream failure");
    expect(records).toHaveLength(1);
    expect(records[0]!.properties["direction"]).toBe("read");
  });
});

describe("ストリームのキャンセル", () => {
  test("読み取りをキャンセルすると以降の書き込みが拒否される", async ({ expect, records }) => {
    // 準備
    const debug = new Debug();
    const stream = debug.getEncodable({ vars: WRITE_VARS });
    const reader = stream.readable.getReader();
    const writer = stream.writable.getWriter();

    // 実行
    const reading = reader.read();
    await writer.write("a");
    await reader.cancel("stop");

    // 検証
    await expect(reading).resolves.toStrictEqual({ done: false, value: "a" });
    await expect(writer.write("b")).rejects.toBe("stop");
    expect(records).toHaveLength(1);
  });

  test("読み取りをキャンセルすると上流の読み取りもキャンセルされる", async ({
    expect,
    records,
  }) => {
    // 準備
    const debug = new Debug();
    const stream = debug.getDecodable({ vars: READ_VARS });
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
    const piping = source.pipeTo(stream.writable, { preventCancel: false }).then(
      () => undefined,
      (reason: unknown) => reason,
    );
    const reader = stream.readable.getReader();
    await expect(reader.read()).resolves.toStrictEqual({ done: false, value: "a" });
    await reader.cancel("stop");

    // 検証
    await expect(piping).resolves.toBe("stop");
    expect(cancelReason).toBe("stop");
    expect(records).toHaveLength(1);
  });
});
