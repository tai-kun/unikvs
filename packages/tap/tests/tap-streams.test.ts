import type { IMiddleware } from "@unikvs/core";
import {
  readAll,
  createNext,
  sourceFrom,
  createDecodeStreamContext,
  createEncodeStreamContext,
} from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

import Tap, { type TapContext } from "../src/tap.js";

const STREAM_METHODS = ["encodeStream", "decodeStream"] as const;

type StreamMethod = (typeof STREAM_METHODS)[number];

/**
 * 指定した方向のストリーム変換を適用し、出力側の ReadableStream を返します。
 *
 * @param tap 実行する Tap です。
 * @param method 実行するストリームフックです。
 * @param source 入力ストリームです。
 *
 * @returns 変換後のストリームです。
 */
async function through(
  tap: Tap,
  method: StreamMethod,
  source: ReadableStream<unknown>,
): Promise<ReadableStream<unknown>> {
  if (method === "encodeStream") {
    const c = createEncodeStreamContext(source);
    await tap.encodeStream(c as IMiddleware.EncodeStreamContext, createNext());

    return c.destination as ReadableStream<unknown>;
  }

  const c = createDecodeStreamContext(source);
  await tap.decodeStream(c as IMiddleware.DecodeStreamContext, createNext());

  return c.destination as ReadableStream<unknown>;
}

/**
 * 指定した方向のストリームコンテキストを作成します。
 *
 * @param method 実行するストリームフックです。
 * @param source 入力ストリームです。
 * @param key 操作対象の論理キーです。
 *
 * @returns 作成したストリームコンテキストです。
 */
function createStreamContext(
  method: StreamMethod,
  source: ReadableStream<unknown>,
  key = "",
): ReturnType<typeof createEncodeStreamContext> {
  if (method === "encodeStream") {
    return createEncodeStreamContext(source, key);
  }

  return createDecodeStreamContext(source, key);
}

/**
 * 指定したストリームフックを実行します。
 *
 * @param tap 実行する Tap です。
 * @param method 実行するストリームフックです。
 * @param c 実行するコンテキストです。
 * @param next 次の処理です。
 */
async function invoke(
  tap: Tap,
  method: StreamMethod,
  c: IMiddleware.EncodeStreamContext | IMiddleware.DecodeStreamContext,
  next: IMiddleware.INext,
): Promise<void> {
  if (method === "encodeStream") {
    await tap.encodeStream(c as IMiddleware.EncodeStreamContext, next);

    return;
  }

  await tap.decodeStream(c as IMiddleware.DecodeStreamContext, next);
}

/**
 * 指定したチャンク列を変換して出力されたチャンクを順に返します。
 *
 * @param tap 実行する Tap です。
 * @param method 実行するストリームフックです。
 * @param chunks 入力するチャンク列です。
 *
 * @returns 出力されたチャンク列です。
 */
async function collectThrough<T>(
  tap: Tap,
  method: StreamMethod,
  chunks: readonly T[],
): Promise<T[]> {
  const destination = await through(tap, method, sourceFrom(chunks));

  return readAll(destination as ReadableStream<T>);
}

describe("ストリームの透過", () => {
  for (const method of STREAM_METHODS) {
    test(`${method} はチャンクを参照と順序を保って出力する`, async ({ expect }) => {
      // 準備：
      const tap = new Tap(() => {});
      const chunks = [new Uint8Array([1, 2, 3]), "text", { nested: { count: 1 } }, 42, null];

      // 実行：
      const output = await collectThrough(tap, method, chunks);

      // 検証：
      expect(output).toHaveLength(chunks.length);

      for (const [index, chunk] of output.entries()) {
        expect(chunk).toBe(chunks[index]);
      }
    });

    test(`${method} はコールバックを一度だけ呼び、コンテキストを渡す`, async ({ expect }) => {
      // 準備：
      const calls: TapContext[] = [];
      const tap = new Tap((c) => {
        calls.push(c);
      });
      const source = sourceFrom(["a", "bc"]);
      const c = createStreamContext(method, source, "key");

      // 実行：
      await invoke(tap, method, c as IMiddleware.EncodeStreamContext, createNext());
      await readAll(c.destination as ReadableStream<string>);

      // 検証：
      expect(calls).toHaveLength(1);
      expect(calls[0]).toBe(c);
      expect(calls[0]?.key).toBe("key");
      expect(calls[0]?.source).toBe(source);
    });

    test(`${method} はコールバックが投げた例外を伝播し next を呼ばない`, async ({ expect }) => {
      // 準備：
      const error = new Error("tap failed");
      const tap = new Tap(() => {
        throw error;
      });
      const source = sourceFrom(["a"]);
      const c = createStreamContext(method, source, "key");
      let nextCalled = false;

      // 実行と検証：
      await expect(
        invoke(tap, method, c as IMiddleware.EncodeStreamContext, async () => {
          nextCalled = true;
        }),
      ).rejects.toBe(error);
      expect(nextCalled).toBe(false);
      expect(c.destination).toBeUndefined();
      expect(source.locked).toBe(false);
    });

    test(`${method} は非同期コールバックの完了を待ってから next を呼ぶ`, async ({ expect }) => {
      // 準備：
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let callbackFinished = false;
      let nextCalled = false;
      const tap = new Tap(async () => {
        await gate;
        callbackFinished = true;
      });
      const c = createStreamContext(method, sourceFrom(["a"]), "key");

      // 実行：
      const operation = invoke(tap, method, c as IMiddleware.EncodeStreamContext, async () => {
        nextCalled = true;
      });

      await Promise.resolve();

      // 検証：
      expect(callbackFinished).toBe(false);
      expect(nextCalled).toBe(false);

      release();
      await operation;
      expect(callbackFinished).toBe(true);
      expect(nextCalled).toBe(true);
    });
  }
});
