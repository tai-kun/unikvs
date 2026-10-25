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
import { test, describe } from "vite-plus/test";

import { Metrics } from "../src/index.js";

describe("encode/decode の透過とバイト数", () => {
  test.for([
    ["hello", 5],
    ["あいう", 9],
    [new Uint8Array([1, 2, 3]), 3],
    [new DataView(new ArrayBuffer(8)), 8],
    [new ArrayBuffer(4), 4],
  ] as const)("encode は %o のバイト数を記録する", async ([data, bytes], { expect }) => {
    // 準備：
    const metrics = new Metrics();
    const c = createEncodeContext(data, "key");

    // 実行：
    await metrics.encode(c as IMiddleware.EncodeContext, createNext());

    // 検証：
    expect(c.destination).toBe(data);
    expect(metrics.getMetrics().records).toHaveLength(1);
    expect(metrics.getMetrics().records.at(0)).toMatchObject({
      key: "key",
      bytes,
      action: "set",
      outcome: "success",
    });
  });

  test("encode は不明な型のバイト数を undefined にする", async ({ expect }) => {
    // 準備：
    const metrics = new Metrics();
    const c = createEncodeContext(42, "key");

    // 実行：
    await metrics.encode(c as IMiddleware.EncodeContext, createNext());

    // 検証：
    expect(c.destination).toBe(42);
    expect(metrics.getMetrics().records.at(0)).toMatchObject({
      bytes: undefined,
      action: "set",
    });
    expect(metrics.getMetrics().byAction["set"]).toMatchObject({ totalBytes: 0 });
  });

  test("decode はバイト数を記録する", async ({ expect }) => {
    // 準備：
    const metrics = new Metrics();
    const data = new Uint8Array([1, 2]);
    const c = createDecodeContext(data, "key");

    // 実行：
    await metrics.decode(c as IMiddleware.DecodeContext, createNext());

    // 検証：
    expect(c.destination).toBe(data);
    expect(metrics.getMetrics().records.at(0)).toMatchObject({
      bytes: 2,
      action: "get",
      outcome: "success",
    });
  });

  test("操作ごとにバイト数と経過時間を合算する", async ({ expect }) => {
    // 準備：
    let now = 0;
    const metrics = new Metrics({
      clock: (): number => now,
    });

    // 実行：
    await metrics.encode(
      createEncodeContext("ab", "a") as IMiddleware.EncodeContext,
      (): Promise<void> => {
        now += 3;

        return Promise.resolve();
      },
    );
    await metrics.encode(
      createEncodeContext("abc", "b") as IMiddleware.EncodeContext,
      (): Promise<void> => {
        now += 7;

        return Promise.resolve();
      },
    );

    // 検証：
    expect(metrics.getMetrics().byAction["set"]).toMatchObject({
      count: 2,
      error: 0,
      success: 2,
      totalBytes: 5,
      totalDurationMs: 10,
    });
  });

  test("encode の失敗を error として記録し再送出する", async ({ expect }) => {
    // 準備：
    const metrics = new Metrics();
    const failure = new Error("encode failure");
    const c = createEncodeContext("hello", "key");

    // 実行：
    const caught = await metrics
      .encode(c as IMiddleware.EncodeContext, (): Promise<void> => Promise.reject(failure))
      .catch((error: unknown): unknown => error);

    // 検証：
    expect(caught).toBe(failure);
    expect(metrics.getMetrics().records.at(0)).toMatchObject({
      bytes: 5,
      action: "set",
      outcome: "error",
    });
  });

  test("decode の失敗を error として記録し再送出する", async ({ expect }) => {
    // 準備：
    const metrics = new Metrics();
    const failure = new Error("decode failure");
    const c = createDecodeContext("hello", "key");

    // 実行：
    const caught = await metrics
      .decode(c as IMiddleware.DecodeContext, (): Promise<void> => Promise.reject(failure))
      .catch((error: unknown): unknown => error);

    // 検証：
    expect(caught).toBe(failure);
    expect(metrics.getMetrics().records.at(0)).toMatchObject({
      bytes: 5,
      action: "get",
      outcome: "error",
    });
  });
});

describe("ストリームの透過とバイト数", () => {
  test("encodeStream はチャンクの合計バイト数を 1 件だけ記録する", async ({ expect }) => {
    // 準備：
    const metrics = new Metrics();
    const chunks = [new Uint8Array([1, 2]), "ab", 42];
    const c = createEncodeStreamContext(sourceFrom(chunks), "stream");

    // 実行：
    await metrics.encodeStream(c as IMiddleware.EncodeStreamContext, createNext());

    const output = await readAll(c.destination as ReadableStream<unknown>);

    // 検証：
    expect(output).toStrictEqual(chunks);

    expect(metrics.getMetrics().records).toHaveLength(1);
    expect(metrics.getMetrics().records.at(0)).toMatchObject({
      key: "stream",
      bytes: 4,
      action: "set",
      outcome: "success",
    });
    expect(typeof metrics.getMetrics().records.at(0)?.durationMs).toBe("number");
  });

  test("decodeStream はチャンクの合計バイト数を記録する", async ({ expect }) => {
    // 準備：
    const metrics = new Metrics();
    const chunks = ["a", "bc"];
    const c = createDecodeStreamContext(sourceFrom(chunks), "stream");

    // 実行：
    await metrics.decodeStream(c as IMiddleware.DecodeStreamContext, createNext());

    const output = await readAll(c.destination as ReadableStream<unknown>);

    // 検証：
    expect(output).toStrictEqual(chunks);

    expect(metrics.getMetrics().records).toHaveLength(1);
    expect(metrics.getMetrics().records.at(0)).toMatchObject({
      bytes: 3,
      action: "stream",
      outcome: "success",
    });
  });

  test("encodeStream の next 失敗を error として記録する", async ({ expect }) => {
    // 準備：
    const metrics = new Metrics();
    const failure = new Error("stream failure");
    const c = createEncodeStreamContext(sourceFrom([new Uint8Array([1])]), "stream");

    // 実行：
    const caught = await metrics
      .encodeStream(c as IMiddleware.EncodeStreamContext, (): Promise<void> =>
        Promise.reject(failure),
      )
      .catch((error: unknown): unknown => error);

    // 検証：
    expect(caught).toBe(failure);
    expect(metrics.getMetrics().records.at(0)).toMatchObject({
      action: "set",
      outcome: "error",
    });
  });

  test("読み取り側の cancel を error として記録する", async ({ expect }) => {
    // 準備：
    const metrics = new Metrics();
    const c = createEncodeStreamContext(sourceFrom([new Uint8Array([1, 2, 3])]), "stream");

    // 実行：
    await metrics.encodeStream(c as IMiddleware.EncodeStreamContext, createNext());
    await (c.destination as ReadableStream<unknown>).getReader().cancel("stop");

    // 検証：
    expect(metrics.getMetrics().records).toHaveLength(1);
    expect(metrics.getMetrics().records.at(0)).toMatchObject({
      action: "set",
      outcome: "error",
    });
  });
});
