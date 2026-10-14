import { collectChunks } from "@unikvs/testing";
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
  test("encode は文字列をそのまま返す", ({ expect }) => {
    // 準備
    const transformer = new WriteOnly();
    const data = "hello";

    // 実行
    const output = transformer.encode({ data });

    // 検証
    expect(output).toBe(data);
  });

  test("encode はバイト列を同じ参照で返す", ({ expect }) => {
    // 準備
    const transformer = new WriteOnly();
    const data = new Uint8Array([1, 2, 3]);

    // 実行
    const output = transformer.encode({ data });

    // 検証
    expect(output).toBe(data);
  });

  test("encode はオブジェクトを同じ参照で返す", ({ expect }) => {
    // 準備
    const transformer = new WriteOnly();
    const data = { foo: "bar" };

    // 実行
    const output = transformer.encode({ data });

    // 検証
    expect(output).toBe(data);
  });
});

describe("ストリームの透過", () => {
  test("getEncodable はチャンクをそのまま出力する", async ({ expect }) => {
    // 準備
    const transformer = new WriteOnly();
    const chunks = [new Uint8Array([1, 2, 3]), "text", { nested: { count: 1 } }, 42, null];

    // 実行
    const output = await collectChunks(transformer.getEncodable(), chunks);

    // 検証
    expect(output).toHaveLength(chunks.length);

    for (const [index, chunk] of output.entries()) {
      expect(chunk).toBe(chunks[index]);
    }
  });

  test("getEncodable は呼び出しごとに独立したストリームを返す", async ({ expect }) => {
    // 準備
    const transformer = new WriteOnly();
    const firstStream = transformer.getEncodable();
    const secondStream = transformer.getEncodable();

    // 実行
    const firstOutput = await collectChunks(firstStream, ["first"]);
    const secondOutput = await collectChunks(secondStream, ["second"]);

    // 検証
    expect(firstStream).not.toBe(secondStream);
    expect(firstOutput).toStrictEqual(["first"]);
    expect(secondOutput).toStrictEqual(["second"]);
  });
});
