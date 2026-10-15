import type { IMiddleware } from "@unikvs/core";
import {
  createEncodeContext,
  createEncodeStreamContext,
  createNext,
  readAll,
  sourceFrom,
} from "@unikvs/testing";
import { describe, test } from "vitest";

import WriteOnly from "../src/write-only.js";

describe("初期化と基本属性", () => {
  test("name は WriteOnly である", ({ expect }) => {
    // 準備
    const transformer = new WriteOnly();

    // 実行と検証
    expect(transformer.name).toBe("WriteOnly");
  });

  test("isOpen は常に true である", ({ expect }) => {
    // 準備
    const transformer = new WriteOnly();

    // 実行と検証
    expect(transformer.isOpen).toBe(true);
  });

  test("allowDelete の既定値は false である", ({ expect }) => {
    // 実行と検証
    expect(new WriteOnly().allowDelete).toBe(false);
    expect(new WriteOnly({}).allowDelete).toBe(false);
    expect(new WriteOnly(undefined).allowDelete).toBe(false);
    expect(new WriteOnly({ allowDelete: undefined }).allowDelete).toBe(false);
    expect(new WriteOnly({ allowDelete: false }).allowDelete).toBe(false);
  });

  test("allowDelete に true を指定できる", ({ expect }) => {
    // 実行と検証
    expect(new WriteOnly({ allowDelete: true }).allowDelete).toBe(true);
  });
});

describe("書き込みの透過", () => {
  test("encode は文字列をそのまま返す", async ({ expect }) => {
    // 準備
    const transformer = new WriteOnly();
    const data = "hello";

    // 実行
    const c = createEncodeContext(data);
    await transformer.encode(c as IMiddleware.EncodeContext, createNext());

    // 検証
    expect(c.destination).toBe(data);
  });

  test("encode はバイト列を同じ参照で返す", async ({ expect }) => {
    // 準備
    const transformer = new WriteOnly();
    const data = new Uint8Array([1, 2, 3]);

    // 実行
    const c = createEncodeContext(data);
    await transformer.encode(c as IMiddleware.EncodeContext, createNext());

    // 検証
    expect(c.destination).toBe(data);
  });

  test("encode はオブジェクトを同じ参照で返す", async ({ expect }) => {
    // 準備
    const transformer = new WriteOnly();
    const data = { foo: "bar" };

    // 実行
    const c = createEncodeContext(data);
    await transformer.encode(c as IMiddleware.EncodeContext, createNext());

    // 検証
    expect(c.destination).toBe(data);
  });
});

describe("ストリームの透過", () => {
  test("encodeStream はチャンクをそのまま出力する", async ({ expect }) => {
    // 準備
    const transformer = new WriteOnly();
    const chunks = [new Uint8Array([1, 2, 3]), "text", { nested: { count: 1 } }, 42, null];

    // 実行
    const c = createEncodeStreamContext(sourceFrom(chunks));
    await transformer.encodeStream(c as IMiddleware.EncodeStreamContext, createNext());
    const output = await readAll(c.destination);

    // 検証
    expect(output).toHaveLength(chunks.length);

    for (const [index, chunk] of output.entries()) {
      expect(chunk).toBe(chunks[index]);
    }
  });

  test("encodeStream は呼び出しごとに独立したストリームを返す", async ({ expect }) => {
    // 準備
    const transformer = new WriteOnly();
    const firstContext = createEncodeStreamContext(sourceFrom(["first"]));
    await transformer.encodeStream(firstContext as IMiddleware.EncodeStreamContext, createNext());
    const secondContext = createEncodeStreamContext(sourceFrom(["second"]));
    await transformer.encodeStream(secondContext as IMiddleware.EncodeStreamContext, createNext());

    // 実行
    const firstOutput = await readAll(firstContext.destination);
    const secondOutput = await readAll(secondContext.destination);

    // 検証
    expect(firstContext.destination).not.toBe(secondContext.destination);
    expect(firstOutput).toStrictEqual(["first"]);
    expect(secondOutput).toStrictEqual(["second"]);
  });
});
