import type { IMiddleware } from "@unikvs/core";
import {
  readAll,
  createNext,
  sourceFrom,
  createGetContext,
  createHasContext,
  createSetContext,
  createDecodeContext,
  createDeleteContext,
  createEncodeContext,
  createStreamContext,
  createDecodeStreamContext,
  createEncodeStreamContext,
} from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

import Tracing from "../src/tracing.js";
import { RecordingTracer } from "./_helpers.js";

/**
 * encode を実行し、変換後の値を返します。
 */
async function encode(tracing: Tracing, data: unknown, key: string): Promise<unknown> {
  const c = createEncodeContext(data, key);
  await tracing.encode(c as IMiddleware.EncodeContext, createNext());

  return c.destination;
}

/**
 * decode を実行し、変換後の値を返します。
 */
async function decode(tracing: Tracing, data: unknown, key: string): Promise<unknown> {
  const c = createDecodeContext(data, key);
  await tracing.decode(c as IMiddleware.DecodeContext, createNext());

  return c.destination;
}

/**
 * チャンク列を書き込みストリームに流し、出力されたチャンクを返します。
 */
async function pumpEncode(
  tracing: Tracing,
  chunks: readonly unknown[],
  key: string,
): Promise<unknown[]> {
  const c = createEncodeStreamContext(sourceFrom(chunks), key);
  await tracing.encodeStream(c as IMiddleware.EncodeStreamContext, createNext());

  return readAll(c.destination as ReadableStream<unknown>);
}

/**
 * チャンク列を読み込みストリームに流し、出力されたチャンクを返します。
 */
async function pumpDecode(
  tracing: Tracing,
  chunks: readonly unknown[],
  key: string,
): Promise<unknown[]> {
  const c = createDecodeStreamContext(sourceFrom(chunks), key);
  await tracing.decodeStream(c as IMiddleware.DecodeStreamContext, createNext());

  return readAll(c.destination as ReadableStream<unknown>);
}

describe("初期化と基本属性", () => {
  test("name プロパティは Tracing である", ({ expect }) => {
    // 準備：
    const tracing = new Tracing();

    // 実行と検証：
    expect(tracing.name).toBe("Tracing");
  });

  test("isOpen は常に true を返す", ({ expect }) => {
    // 準備：
    const tracing = new Tracing();

    // 実行と検証：
    expect(tracing.isOpen).toBe(true);
  });

  test("既定の接頭辞は unikvs. である", ({ expect }) => {
    // 準備：
    const tracing = new Tracing();

    // 実行と検証：
    expect(tracing.spanNamePrefix).toBe("unikvs.");
  });

  test("トレーサーを省略しても操作はそのまま通る", async ({ expect }) => {
    // 準備：
    const tracing = new Tracing();
    const data = new Uint8Array([1, 2, 3]);

    // 実行：
    const output = await encode(tracing, data, "key");

    // 検証：
    expect(output).toBe(data);
  });

  test("encode はデータを変換せずにそのまま返す", async ({ expect }) => {
    // 準備：
    const tracing = new Tracing({ tracer: new RecordingTracer() });
    const data = new Uint8Array([1, 2, 3]);

    // 実行：
    const output = await encode(tracing, data, "key");

    // 検証：
    expect(output).toBe(data);
  });

  test("decode はデータを変換せずにそのまま返す", async ({ expect }) => {
    // 準備：
    const tracing = new Tracing({ tracer: new RecordingTracer() });
    const data = "hello";

    // 実行：
    const output = await decode(tracing, data, "key");

    // 検証：
    expect(output).toBe(data);
  });

  test("encode と decode は next を呼ぶ前に destination を設定する", async ({ expect }) => {
    // 準備：
    const tracing = new Tracing();
    const encoded = new Uint8Array([1, 2, 3]);
    const decoded = "hello";
    const seen: unknown[] = [];
    const encodeContext = createEncodeContext(encoded, "key");
    const decodeContext = createDecodeContext(decoded, "key");

    // 実行：
    await tracing.encode(encodeContext as IMiddleware.EncodeContext, (): Promise<void> => {
      seen.push(encodeContext.destination);

      return Promise.resolve();
    });
    await tracing.decode(decodeContext as IMiddleware.DecodeContext, (): Promise<void> => {
      seen.push(decodeContext.destination);

      return Promise.resolve();
    });

    // 検証：
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe(encoded);
    expect(seen[1]).toBe(decoded);
    expect(encodeContext.destination).toBe(encoded);
    expect(decodeContext.destination).toBe(decoded);
  });
});

describe("操作ごとのスパン", () => {
  test("use は操作ごとに対応するスパンを作る", async ({ expect }) => {
    // 準備：
    const tracer = new RecordingTracer();
    const tracing = new Tracing({ tracer });
    // 本番の clear コンテキストは key を持たないため、同じ形のコンテキストを使います。
    const clearContext = {
      action: "clear",
      signal: new AbortController().signal,
    } as unknown as IMiddleware.UseContext;
    const cases = [
      [createSetContext("set-key"), "set-key"],
      [createGetContext("get-key"), "get-key"],
      [createStreamContext("stream-key"), "stream-key"],
      [createHasContext("has-key"), "has-key"],
      [createDeleteContext("delete-key"), "delete-key"],
      [clearContext, ""],
    ] as [IMiddleware.UseContext, string][];

    // 実行：
    for (const [c] of cases) {
      await tracing.use(c, createNext());
    }

    // 検証：
    expect(tracer.spans).toHaveLength(cases.length);

    for (const [index, [c, key]] of cases.entries()) {
      const span = tracer.spans.at(index);
      expect(span?.name).toBe(`unikvs.use.${c.action}`);
      expect(span?.attributes.get("key")).toBe(key);
      expect(span?.attributes.get("action")).toBe(c.action);
      expect(span?.attributes.get("success")).toBe(true);
      expect(span?.attributes.get("durationMs")).toEqual(expect.any(Number));
      expect(span?.status).toStrictEqual({ code: "ok" });
      expect(span?.ended).toBe(true);
      expect(span?.endCount).toBe(1);
    }
  });

  test("encode はスパンにキーと成否と遅延を記録する", async ({ expect }) => {
    // 準備：
    const tracer = new RecordingTracer();
    const tracing = new Tracing({ tracer });

    // 実行：
    await encode(tracing, "hello", "greeting");

    // 検証：
    expect(tracer.spans).toHaveLength(1);

    const span = tracer.spans.at(0);
    expect(span?.name).toBe("unikvs.encode");
    expect(span?.attributes.get("key")).toBe("greeting");
    expect(span?.attributes.get("action")).toBe("set");
    expect(span?.attributes.get("success")).toBe(true);
    expect(span?.attributes.get("durationMs")).toEqual(expect.any(Number));
    expect(span?.attributes.get("durationMs") as number).toBeGreaterThanOrEqual(0);
    expect(span?.status).toStrictEqual({ code: "ok" });
    expect(span?.ended).toBe(true);
  });

  test("decode はスパンにキーと成否と遅延を記録する", async ({ expect }) => {
    // 準備：
    const tracer = new RecordingTracer();
    const tracing = new Tracing({ tracer });

    // 実行：
    await decode(tracing, "hello", "blob");

    // 検証：
    expect(tracer.spans).toHaveLength(1);

    const span = tracer.spans.at(0);
    expect(span?.name).toBe("unikvs.decode");
    expect(span?.attributes.get("key")).toBe("blob");
    expect(span?.attributes.get("action")).toBe("get");
    expect(span?.attributes.get("success")).toBe(true);
    expect(span?.attributes.get("durationMs")).toEqual(expect.any(Number));
    expect(span?.status).toStrictEqual({ code: "ok" });
    expect(span?.ended).toBe(true);
  });

  test("encodeStream は読み切りで 1 件のスパンを記録し、チャンクをそのまま通す", async ({
    expect,
  }) => {
    // 準備：
    const tracer = new RecordingTracer();
    const tracing = new Tracing({ tracer });
    const input = [new Uint8Array([1]), new Uint8Array([2, 3])];

    // 実行：
    const output = await pumpEncode(tracing, input, "stream");

    // 検証：
    expect(output).toStrictEqual(input);
    expect(output[0]).toBe(input[0]);
    expect(output[1]).toBe(input[1]);
    expect(tracer.spans).toHaveLength(1);

    const span = tracer.spans.at(0);
    expect(span?.name).toBe("unikvs.encodeStream");
    expect(span?.attributes.get("key")).toBe("stream");
    expect(span?.attributes.get("action")).toBe("set");
    expect(span?.attributes.get("success")).toBe(true);
    expect(span?.attributes.get("durationMs")).toEqual(expect.any(Number));
    expect(span?.status).toStrictEqual({ code: "ok" });
    expect(span?.ended).toBe(true);
  });

  test("decodeStream は読み切りで 1 件のスパンを記録し、チャンクをそのまま通す", async ({
    expect,
  }) => {
    // 準備：
    const tracer = new RecordingTracer();
    const tracing = new Tracing({ tracer });
    const input = ["a", "bc"];

    // 実行：
    const output = await pumpDecode(tracing, input, "stream");

    // 検証：
    expect(output).toStrictEqual(input);
    expect(output[0]).toBe(input[0]);
    expect(output[1]).toBe(input[1]);
    expect(tracer.spans).toHaveLength(1);

    const span = tracer.spans.at(0);
    expect(span?.name).toBe("unikvs.decodeStream");
    expect(span?.attributes.get("key")).toBe("stream");
    expect(span?.attributes.get("action")).toBe("stream");
    expect(span?.attributes.get("success")).toBe(true);
    expect(span?.attributes.get("durationMs")).toEqual(expect.any(Number));
    expect(span?.status).toStrictEqual({ code: "ok" });
    expect(span?.ended).toBe(true);
  });

  test("encodeStream と decodeStream は next を呼ぶ前に destination を設定する", async ({
    expect,
  }) => {
    // 準備：
    const tracing = new Tracing();
    const encodeContext = createEncodeStreamContext(sourceFrom(["a", "bc"]), "stream-key");
    const decodeContext = createDecodeStreamContext(sourceFrom(["d"]), "stream-key");
    const seen: unknown[] = [];

    // 実行：
    await tracing.encodeStream(
      encodeContext as IMiddleware.EncodeStreamContext,
      (): Promise<void> => {
        seen.push(encodeContext.destination);

        return Promise.resolve();
      },
    );
    await tracing.decodeStream(
      decodeContext as IMiddleware.DecodeStreamContext,
      (): Promise<void> => {
        seen.push(decodeContext.destination);

        return Promise.resolve();
      },
    );

    const encodedChunks = await readAll(encodeContext.destination as ReadableStream<string>);
    const decodedChunks = await readAll(decodeContext.destination as ReadableStream<string>);

    // 検証：
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBeDefined();
    expect(seen[1]).toBeDefined();
    expect(seen[0]).toBe(encodeContext.destination);
    expect(seen[1]).toBe(decodeContext.destination);
    expect(encodedChunks).toStrictEqual(["a", "bc"]);
    expect(decodedChunks).toStrictEqual(["d"]);
  });

  test("spanNamePrefix を指定するとスパン名に反映される", async ({ expect }) => {
    // 準備：
    const tracer = new RecordingTracer();
    const tracing = new Tracing({
      tracer,
      spanNamePrefix: "myapp.kvs.",
    });

    // 実行：
    await encode(tracing, "hello", "key");
    await decode(tracing, "hello", "key");
    await tracing.use(createGetContext("key") as IMiddleware.UseContext, createNext());
    await pumpEncode(tracing, ["a"], "key");
    await pumpDecode(tracing, ["a"], "key");

    // 検証：
    expect(tracer.spans.map((span) => span.name)).toStrictEqual([
      "myapp.kvs.encode",
      "myapp.kvs.decode",
      "myapp.kvs.use.get",
      "myapp.kvs.encodeStream",
      "myapp.kvs.decodeStream",
    ]);
  });
});
