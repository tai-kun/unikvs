import { type LogRecord, configureSync } from "@logtape/logtape";
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
import { type TestAPI, test as vitest } from "vite-plus/test";

import type Debug from "../src/debug.js";

/**
 * データを書き込みとして記録し、そのまま返します。
 *
 * @param debug 検証対象の Debug トランスフォーマーです。
 * @param data 記録するデータです。
 * @param key 操作対象のキーです。
 *
 * @returns 変換後のデータを返します。
 */
export async function encode(debug: Debug, data: unknown, key = "key"): Promise<unknown> {
  const c = createEncodeContext(data, key);
  await debug.encode(c as IMiddleware.EncodeContext, createNext());

  return c.destination;
}

/**
 * データを読み込みとして記録し、そのまま返します。
 *
 * @param debug 検証対象の Debug トランスフォーマーです。
 * @param data 記録するデータです。
 * @param key 操作対象のキーです。
 *
 * @returns 変換後のデータを返します。
 */
export async function decode(debug: Debug, data: unknown, key = "key"): Promise<unknown> {
  const c = createDecodeContext(data, key);
  await debug.decode(c as IMiddleware.DecodeContext, createNext());

  return c.destination;
}

/**
 * チャンク列を書き込みストリームに流し、出力されたチャンクを返します。
 *
 * @param debug 検証対象の Debug トランスフォーマーです。
 * @param chunks 流すチャンク列です。
 * @param key 操作対象のキーです。
 *
 * @returns 出力されたチャンク列を返します。
 */
export async function pumpEncode(
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
 *
 * @param debug 検証対象の Debug トランスフォーマーです。
 * @param chunks 流すチャンク列です。
 * @param key 操作対象のキーです。
 *
 * @returns 出力されたチャンク列を返します。
 */
export async function pumpDecode(
  debug: Debug,
  chunks: readonly unknown[],
  key: string,
): Promise<unknown[]> {
  const c = createDecodeStreamContext(sourceFrom(chunks), key);
  await debug.decodeStream(c as IMiddleware.DecodeStreamContext, createNext());

  return readAll(c.destination as ReadableStream<unknown>);
}

/**
 * Debug トランスフォーマーのログを集めるテスト用の sink を設定し、テストごとに記録を空にする `records` フィクスチャーを持つ `test` を返します。
 * 実際に記録されたレコードの内容を検証するために使用します。
 */
export function createRecordsTest(): TestAPI<{ records: LogRecord[] }> {
  const records: LogRecord[] = [];
  configureSync({
    reset: true,
    sinks: {
      test: (record) => {
        records.push(record);
      },
    },
    loggers: [
      {
        sinks: ["test"],
        category: ["@unikvs/*", "@unikvs/debug"],
        lowestLevel: "debug",
      },
    ],
  });

  return vitest.extend<{ records: LogRecord[] }>({
    async records({}, use) {
      records.length = 0;
      await use(records);
    },
  });
}
