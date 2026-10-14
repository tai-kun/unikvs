import { Variables } from "@unikvs/core";
import { captureThrown } from "@unikvs/testing";
import { describe, test } from "vitest";

import { KeyNotFoundError } from "../src/errors.js";
import WriteOnly from "../src/write-only.js";

describe("読み出しの拒否", () => {
  test("decode を呼び出したとき、KeyNotFoundError を投げる", ({ expect }) => {
    // 準備
    const transformer = new WriteOnly();
    const vars = new Variables({ "unikvs:key": "k1" });

    // 実行
    const error = captureThrown(() => transformer.decode({ vars, data: "v1" }));

    // 検証
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect(error).toMatchObject({
      name: "UniKvsKeyNotFoundError",
      message: "Key not found: k1",
      meta: { key: "k1" },
    });
  });

  test("getDecodable を呼び出したとき、KeyNotFoundError を投げる", ({ expect }) => {
    // 準備
    const transformer = new WriteOnly();
    const vars = new Variables({ "unikvs:key": "k1" });

    // 実行
    const error = captureThrown(() => transformer.getDecodable({ vars }));

    // 検証
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect(error).toMatchObject({
      name: "UniKvsKeyNotFoundError",
      message: "Key not found: k1",
      meta: { key: "k1" },
    });
  });

  test("onExists を呼び出したとき、KeyNotFoundError を投げる", ({ expect }) => {
    // 準備
    const transformer = new WriteOnly();

    // 実行
    const error = captureThrown(() => transformer.onExists({ key: "k1" }));

    // 検証
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect(error).toMatchObject({
      name: "UniKvsKeyNotFoundError",
      message: "Key not found: k1",
      meta: { key: "k1" },
    });
  });

  test("decode はデータの内容によらず KeyNotFoundError を投げる", ({ expect }) => {
    // 準備
    const transformer = new WriteOnly();
    const vars = new Variables({ "unikvs:key": "k1" });

    // 実行と検証
    expect(() => transformer.decode({ vars, data: "v1" })).toThrow(KeyNotFoundError);
    expect(() => transformer.decode({ vars, data: new Uint8Array([1]) })).toThrow(KeyNotFoundError);
    expect(() => transformer.decode({ vars, data: null })).toThrow(KeyNotFoundError);
  });
});

describe("代替名への切り替え", () => {
  test("decode は vars にキーがないとき (unknown) の KeyNotFoundError を投げる", ({ expect }) => {
    // 準備
    const transformer = new WriteOnly();

    // 実行
    const error = captureThrown(() => transformer.decode({ vars: new Variables(), data: "v1" }));

    // 検証
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect(error).toMatchObject({
      name: "UniKvsKeyNotFoundError",
      message: "Key not found: (unknown)",
      meta: { key: "(unknown)" },
    });
  });

  test("decode は vars のキーが非文字列のとき (unknown) の KeyNotFoundError を投げる", ({
    expect,
  }) => {
    // 準備
    const transformer = new WriteOnly();
    const vars = new Variables({ "unikvs:key": 123 });

    // 実行
    const error = captureThrown(() => transformer.decode({ vars, data: "v1" }));

    // 検証
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect(error).toMatchObject({
      name: "UniKvsKeyNotFoundError",
      message: "Key not found: (unknown)",
      meta: { key: "(unknown)" },
    });
  });

  test("getDecodable は vars にキーがないとき (unknown) の KeyNotFoundError を投げる", ({
    expect,
  }) => {
    // 準備
    const transformer = new WriteOnly();

    // 実行
    const error = captureThrown(() => transformer.getDecodable({ vars: new Variables() }));

    // 検証
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect(error).toMatchObject({
      name: "UniKvsKeyNotFoundError",
      message: "Key not found: (unknown)",
      meta: { key: "(unknown)" },
    });
  });

  test("getDecodable は vars のキーが非文字列のとき (unknown) の KeyNotFoundError を投げる", ({
    expect,
  }) => {
    // 準備
    const transformer = new WriteOnly();
    const vars = new Variables({ "unikvs:key": null });

    // 実行
    const error = captureThrown(() => transformer.getDecodable({ vars }));

    // 検証
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect(error).toMatchObject({
      name: "UniKvsKeyNotFoundError",
      message: "Key not found: (unknown)",
      meta: { key: "(unknown)" },
    });
  });
});
