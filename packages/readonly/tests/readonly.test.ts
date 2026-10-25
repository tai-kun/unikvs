import type { IMiddleware } from "@unikvs/core";
import {
  readAll,
  createNext,
  sourceFrom,
  createDecodeContext,
  createDecodeStreamContext,
} from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

import ReadOnly from "../src/readonly.js";

describe("初期化と基本属性", () => {
  test("name は ReadOnly である", ({ expect }) => {
    // 準備：
    const transformer = new ReadOnly();

    // 実行と検証：
    expect(transformer.name).toBe("ReadOnly");
  });

  test("isOpen は常に true である", ({ expect }) => {
    // 準備：
    const transformer = new ReadOnly();

    // 実行と検証：
    expect(transformer.isOpen).toBe(true);
  });

  test("allowDelete の既定値は false である", ({ expect }) => {
    // 実行と検証：
    expect(new ReadOnly().allowDelete).toBe(false);
    expect(new ReadOnly({}).allowDelete).toBe(false);
    expect(new ReadOnly(undefined).allowDelete).toBe(false);
    expect(new ReadOnly({ allowDelete: undefined }).allowDelete).toBe(false);
    expect(new ReadOnly({ allowDelete: false }).allowDelete).toBe(false);
  });

  test("allowDelete に true を指定できる", ({ expect }) => {
    // 実行と検証：
    expect(new ReadOnly({ allowDelete: true }).allowDelete).toBe(true);
  });
});

describe("読み出しの透過", () => {
  test("decode は文字列をそのまま返し、next に委譲する", async ({ expect }) => {
    // 準備：
    const transformer = new ReadOnly();
    const data = "hello";
    const c = createDecodeContext(data, "k1");
    let nextCalls = 0;
    let destinationAtNext: unknown;

    // 実行：
    await transformer.decode(c as IMiddleware.DecodeContext, (): Promise<void> => {
      nextCalls += 1;
      destinationAtNext = c.destination;

      return Promise.resolve();
    });

    // 検証 : next は変換後の destination を設定した状態で 1 回だけ呼ばれる。
    expect(c.destination).toBe(data);
    expect(destinationAtNext).toBe(data);
    expect(nextCalls).toBe(1);
  });

  test("decode はバイト列を同じ参照で返す", async ({ expect }) => {
    // 準備：
    const transformer = new ReadOnly();
    const data = new Uint8Array([1, 2, 3]);

    // 実行：
    const c = createDecodeContext(data, "k1");
    await transformer.decode(c as IMiddleware.DecodeContext, createNext());

    // 検証：
    expect(c.destination).toBe(data);
  });

  test("decode はオブジェクトを同じ参照で返す", async ({ expect }) => {
    // 準備：
    const transformer = new ReadOnly();
    const data = { foo: "bar" };

    // 実行：
    const c = createDecodeContext(data, "k1");
    await transformer.decode(c as IMiddleware.DecodeContext, createNext());

    // 検証：
    expect(c.destination).toBe(data);
  });
});

describe("ストリームの透過", () => {
  test("decodeStream はチャンクをそのまま出力し、next に委譲する", async ({ expect }) => {
    // 準備：
    const transformer = new ReadOnly();
    const chunks = [new Uint8Array([1, 2, 3]), "text", { nested: { count: 1 } }, 42, null];
    const c = createDecodeStreamContext(sourceFrom(chunks), "k1");
    let nextCalls = 0;
    let destinationAtNext: unknown;

    // 実行：
    await transformer.decodeStream(c as IMiddleware.DecodeStreamContext, (): Promise<void> => {
      nextCalls += 1;
      destinationAtNext = c.destination;

      return Promise.resolve();
    });

    const output = await readAll(c.destination);

    // 検証 : next は元のストリームを設定した状態で 1 回だけ呼ばれる。
    expect(destinationAtNext).toBe(c.source);
    expect(nextCalls).toBe(1);
    expect(output).toHaveLength(chunks.length);

    for (const [index, chunk] of output.entries()) {
      expect(chunk).toBe(chunks[index]);
    }
  });

  test("decodeStream は呼び出しごとに独立したストリームを返す", async ({ expect }) => {
    // 準備：
    const transformer = new ReadOnly();
    const firstContext = createDecodeStreamContext(sourceFrom(["first"]), "k1");
    await transformer.decodeStream(firstContext as IMiddleware.DecodeStreamContext, createNext());

    const secondContext = createDecodeStreamContext(sourceFrom(["second"]), "k1");
    await transformer.decodeStream(secondContext as IMiddleware.DecodeStreamContext, createNext());

    // 実行：
    const firstOutput = await readAll(firstContext.destination);
    const secondOutput = await readAll(secondContext.destination);

    // 検証：
    expect(firstContext.destination).not.toBe(secondContext.destination);
    expect(firstOutput).toStrictEqual(["first"]);
    expect(secondOutput).toStrictEqual(["second"]);
  });
});
