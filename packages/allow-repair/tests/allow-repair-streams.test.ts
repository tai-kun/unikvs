import type { IMiddleware } from "@unikvs/core";
import {
  type TestContext,
  readAll,
  createNext,
  sourceFrom,
  createDecodeStreamContext,
  createEncodeStreamContext,
} from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

import AllowRepair from "../src/allow-repair.js";

/**
 * チャンク列をエンコードストリームに流し、出力されたチャンクを順に返します。
 * 素通しされることを検証するために使用します。
 */
async function encodeChunks(gate: AllowRepair, c: TestContext): Promise<unknown[]> {
  await gate.encodeStream(c as IMiddleware.EncodeStreamContext, createNext());

  return readAll(c.destination);
}

/**
 * エンコードストリーム用コンテキストを作成します。
 */
function encodeContextFor(chunks: readonly unknown[]): TestContext {
  return createEncodeStreamContext(sourceFrom(chunks));
}

describe("encodeStream の透過", () => {
  test("素通しのストリームを返す", async ({ expect }) => {
    // 準備：
    const gate = new AllowRepair();
    const chunks = [new Uint8Array([1, 2, 3]), "text", 42];

    // 実行：
    const output = await encodeChunks(gate, encodeContextFor(chunks));

    // 検証：
    expect(output).toHaveLength(chunks.length);

    for (const [index, chunk] of output.entries()) {
      expect(chunk).toBe(chunks[index]);
    }
  });

  test("disable 中でも素通しのストリームを返す", async ({ expect }) => {
    // 準備：
    const gate = new AllowRepair();
    gate.disable();

    const chunk = new Uint8Array([1, 2, 3]);

    // 実行：
    const output = await encodeChunks(gate, encodeContextFor([chunk]));

    // 検証：
    expect(output).toHaveLength(1);
    expect(output[0]).toBe(chunk);
  });

  test("enable 後に再び素通しのストリームを返す", async ({ expect }) => {
    // 準備：
    const gate = new AllowRepair();
    gate.disable();
    gate.enable();

    const chunk = new Uint8Array([1]);

    // 実行：
    const output = await encodeChunks(gate, encodeContextFor([chunk]));

    // 検証：
    expect(output).toHaveLength(1);
    expect(output[0]).toBe(chunk);
  });

  test("空チャンク列でも順序を保って出力する", async ({ expect }) => {
    // 準備：
    const gate = new AllowRepair();

    // 実行：
    const output = await encodeChunks(gate, encodeContextFor([]));

    // 検証：
    expect(output).toStrictEqual([]);
  });
});

describe("decodeStream の透過", () => {
  test("常に素通しのストリームを返す", async ({ expect }) => {
    // 準備：
    const gate = new AllowRepair();
    const chunks = [new Uint8Array([1, 2, 3]), "text", { nested: { count: 1 } }];

    // 実行：
    const c = createDecodeStreamContext(sourceFrom(chunks));
    await gate.decodeStream(c as IMiddleware.DecodeStreamContext, createNext());

    const output = await readAll(c.destination);

    // 検証：
    expect(output).toHaveLength(chunks.length);

    for (const [index, chunk] of output.entries()) {
      expect(chunk).toBe(chunks[index]);
    }
  });

  test("disable 中でも投げずに素通しのストリームを返す", async ({ expect }) => {
    // 準備：
    const gate = new AllowRepair();
    gate.disable();

    const chunk = new Uint8Array([1]);

    // 実行：
    const c = createDecodeStreamContext(sourceFrom([chunk]));
    await gate.decodeStream(c as IMiddleware.DecodeStreamContext, createNext());

    const output = await readAll(c.destination);

    // 検証：
    expect(output).toHaveLength(1);
    expect(output[0]).toBe(chunk);
  });
});
