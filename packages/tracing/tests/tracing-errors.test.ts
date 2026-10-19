import type { IMiddleware } from "@unikvs/core";
import {
  createDecodeContext,
  createDecodeStreamContext,
  createEncodeContext,
  createEncodeStreamContext,
  createGetContext,
  readAll,
  sourceFrom,
} from "@unikvs/testing";
import { describe, test } from "vitest";

import Tracing from "../src/tracing.js";
import { RecordingTracer } from "./_helpers.js";

/**
 * 失敗する next を作成します。
 * エラー時のスパン状態を検証するために使用します。
 */
function createFailingNext(error: unknown): IMiddleware.INext {
  return async () => {
    throw error;
  };
}

describe("エラーの記録", () => {
  test("use が失敗したら success は false になり、エラー状態と遅延を記録する", async ({
    expect,
  }) => {
    // 準備
    const tracer = new RecordingTracer();
    const tracing = new Tracing({ tracer });
    const failure = new Error("boom");

    // 実行
    const promise = tracing.use(
      createGetContext("key") as IMiddleware.UseContext,
      createFailingNext(failure),
    );

    // 検証
    await expect(promise).rejects.toBe(failure);
    expect(tracer.spans).toHaveLength(1);
    const span = tracer.spans[0]!;
    expect(span.name).toBe("unikvs.use.get");
    expect(span.attributes.get("key")).toBe("key");
    expect(span.attributes.get("success")).toBe(false);
    expect(span.attributes.get("durationMs")).toEqual(expect.any(Number));
    expect(span.status).toStrictEqual({ code: "error", message: "boom" });
    expect(span.ended).toBe(true);
    expect(span.endCount).toBe(1);
  });

  test("Error 以外が投げられてもメッセージを文字列化して記録する", async ({ expect }) => {
    // 準備
    const tracer = new RecordingTracer();
    const tracing = new Tracing({ tracer });

    // 実行
    const promise = tracing.encode(
      createEncodeContext("data", "key") as IMiddleware.EncodeContext,
      createFailingNext("string failure"),
    );

    // 検証
    await expect(promise).rejects.toBe("string failure");
    expect(tracer.spans).toHaveLength(1);
    const span = tracer.spans[0]!;
    expect(span.attributes.get("success")).toBe(false);
    expect(span.status).toStrictEqual({ code: "error", message: "string failure" });
    expect(span.ended).toBe(true);
  });

  test("decode が失敗したらエラーをそのまま投げてスパンを終了する", async ({ expect }) => {
    // 準備
    const tracer = new RecordingTracer();
    const tracing = new Tracing({ tracer });
    const failure = new Error("decode failed");

    // 実行
    const promise = tracing.decode(
      createDecodeContext("data", "key") as IMiddleware.DecodeContext,
      createFailingNext(failure),
    );

    // 検証
    await expect(promise).rejects.toBe(failure);
    expect(tracer.spans).toHaveLength(1);
    const span = tracer.spans[0]!;
    expect(span.name).toBe("unikvs.decode");
    expect(span.attributes.get("success")).toBe(false);
    expect(span.status).toStrictEqual({ code: "error", message: "decode failed" });
    expect(span.ended).toBe(true);
  });

  test("next が失敗したらストリームのスパンをエラーで終了する", async ({ expect }) => {
    // 準備
    const tracer = new RecordingTracer();
    const tracing = new Tracing({ tracer });
    const failure = new Error("setup failed");
    const c = createEncodeStreamContext(sourceFrom(["a"]), "stream");

    // 実行
    const promise = tracing.encodeStream(
      c as IMiddleware.EncodeStreamContext,
      createFailingNext(failure),
    );

    // 検証
    await expect(promise).rejects.toBe(failure);
    expect(tracer.spans).toHaveLength(1);
    const span = tracer.spans[0]!;
    expect(span.name).toBe("unikvs.encodeStream");
    expect(span.attributes.get("success")).toBe(false);
    expect(span.status).toStrictEqual({ code: "error", message: "setup failed" });
    expect(span.ended).toBe(true);
  });

  test("ストリーム本体が失敗したらスパンをエラーで終了する", async ({ expect }) => {
    // 準備
    const tracer = new RecordingTracer();
    const tracing = new Tracing({ tracer });
    const failure = new Error("chunk failed");
    const source = new ReadableStream<string>({
      start(controller) {
        controller.enqueue("a");
        controller.error(failure);
      },
    });
    const c = createDecodeStreamContext(source, "stream");
    await tracing.decodeStream(c as IMiddleware.DecodeStreamContext, async () => {});

    // 実行
    const promise = readAll(c.destination as ReadableStream<string>);

    // 検証
    await expect(promise).rejects.toBe(failure);
    expect(tracer.spans).toHaveLength(1);
    const span = tracer.spans[0]!;
    expect(span.name).toBe("unikvs.decodeStream");
    expect(span.attributes.get("key")).toBe("stream");
    expect(span.attributes.get("success")).toBe(false);
    expect(span.status).toStrictEqual({ code: "error", message: "chunk failed" });
    expect(span.attributes.get("durationMs")).toEqual(expect.any(Number));
    expect(span.ended).toBe(true);
  });

  test("ストリームを取り消してもスパンを終了する", async ({ expect }) => {
    // 準備
    const tracer = new RecordingTracer();
    const tracing = new Tracing({ tracer });
    const c = createEncodeStreamContext(sourceFrom(["a", "b"]), "stream");
    await tracing.encodeStream(c as IMiddleware.EncodeStreamContext, async () => {});
    const reader = (c.destination as ReadableStream<string>).getReader();

    // 実行
    await reader.read();
    await reader.cancel("cancelled");

    // 検証
    expect(tracer.spans).toHaveLength(1);
    const span = tracer.spans[0]!;
    expect(span.attributes.get("success")).toBe(true);
    expect(span.status).toStrictEqual({ code: "ok" });
    expect(span.ended).toBe(true);
  });
});
