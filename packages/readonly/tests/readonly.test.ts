import type { IMiddleware } from "@unikvs/core";
import {
  createDecodeContext,
  createDecodeStreamContext,
  createNext,
  readAll,
  sourceFrom,
} from "@unikvs/testing";
import { describe, test } from "vitest";

import ReadOnly from "../src/readonly.js";

describe("初期化と基本属性", () => {
  test("name は ReadOnly である", ({ expect }) => {
    // 準備
    const transformer = new ReadOnly();

    // 実行と検証
    expect(transformer.name).toBe("ReadOnly");
  });

  test("isOpen は常に true である", ({ expect }) => {
    // 準備
    const transformer = new ReadOnly();

    // 実行と検証
    expect(transformer.isOpen).toBe(true);
  });
});

describe("読み出しの透過", () => {
  test("decode は文字列をそのまま返す", async ({ expect }) => {
    // 準備
    const transformer = new ReadOnly();
    const data = "hello";

    // 実行
    const c = createDecodeContext(data, "k1");
    await transformer.decode(c as IMiddleware.DecodeContext, createNext());

    // 検証
    expect(c.destination).toBe(data);
  });

  test("decode はバイト列を同じ参照で返す", async ({ expect }) => {
    // 準備
    const transformer = new ReadOnly();
    const data = new Uint8Array([1, 2, 3]);

    // 実行
    const c = createDecodeContext(data, "k1");
    await transformer.decode(c as IMiddleware.DecodeContext, createNext());

    // 検証
    expect(c.destination).toBe(data);
  });

  test("decode はオブジェクトを同じ参照で返す", async ({ expect }) => {
    // 準備
    const transformer = new ReadOnly();
    const data = { foo: "bar" };

    // 実行
    const c = createDecodeContext(data, "k1");
    await transformer.decode(c as IMiddleware.DecodeContext, createNext());

    // 検証
    expect(c.destination).toBe(data);
  });
});

describe("ストリームの透過", () => {
  test("decodeStream はチャンクをそのまま出力する", async ({ expect }) => {
    // 準備
    const transformer = new ReadOnly();
    const chunks = [new Uint8Array([1, 2, 3]), "text", { nested: { count: 1 } }, 42, null];

    // 実行
    const c = createDecodeStreamContext(sourceFrom(chunks), "k1");
    await transformer.decodeStream(c as IMiddleware.DecodeStreamContext, createNext());
    const output = await readAll(c.destination);

    // 検証
    expect(output).toHaveLength(chunks.length);

    for (const [index, chunk] of output.entries()) {
      expect(chunk).toBe(chunks[index]);
    }
  });

  test("decodeStream は呼び出しごとに独立したストリームを返す", async ({ expect }) => {
    // 準備
    const transformer = new ReadOnly();
    const firstContext = createDecodeStreamContext(sourceFrom(["first"]), "k1");
    await transformer.decodeStream(firstContext as IMiddleware.DecodeStreamContext, createNext());
    const secondContext = createDecodeStreamContext(sourceFrom(["second"]), "k1");
    await transformer.decodeStream(secondContext as IMiddleware.DecodeStreamContext, createNext());

    // 実行
    const firstOutput = await readAll(firstContext.destination);
    const secondOutput = await readAll(secondContext.destination);

    // 検証
    expect(firstContext.destination).not.toBe(secondContext.destination);
    expect(firstOutput).toStrictEqual(["first"]);
    expect(secondOutput).toStrictEqual(["second"]);
  });
});
