import type { IMiddleware } from "@unikvs/core";
import {
  captureRejection,
  createDecodeContext,
  createDecodeStreamContext,
  createDeleteContext,
  createGetContext,
  createHasContext,
  createNext,
  createSetContext,
  createStreamContext,
  sourceFrom,
} from "@unikvs/testing";
import { describe, test } from "vitest";

import { KeyNotFoundError } from "../src/errors.js";
import WriteOnly from "../src/write-only.js";

describe("読み出しの拒否", () => {
  test("decode を呼び出したとき、KeyNotFoundError を投げる", async ({ expect }) => {
    // 準備
    const transformer = new WriteOnly();

    // 実行
    const error = await captureRejection(
      transformer.decode(createDecodeContext("v1", "k1") as IMiddleware.DecodeContext),
    );

    // 検証
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect(error).toMatchObject({
      name: "UniKvsKeyNotFoundError",
      message: "Key not found: k1",
      meta: { key: "k1" },
    });
  });

  test("decodeStream を呼び出したとき、KeyNotFoundError を投げる", async ({ expect }) => {
    // 準備
    const transformer = new WriteOnly();

    // 実行
    const error = await captureRejection(
      transformer.decodeStream(
        createDecodeStreamContext(sourceFrom(["v1"]), "k1") as IMiddleware.DecodeStreamContext,
      ),
    );

    // 検証
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect(error).toMatchObject({
      name: "UniKvsKeyNotFoundError",
      message: "Key not found: k1",
      meta: { key: "k1" },
    });
  });

  test("use に has を渡したとき、KeyNotFoundError を投げる", async ({ expect }) => {
    // 準備
    const transformer = new WriteOnly();

    // 実行
    const error = await captureRejection(
      transformer.use(createHasContext("k1") as IMiddleware.UseContext, createNext()),
    );

    // 検証
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect(error).toMatchObject({
      name: "UniKvsKeyNotFoundError",
      message: "Key not found: k1",
      meta: { key: "k1" },
    });
  });

  test("use に get を渡したとき、KeyNotFoundError を投げる", async ({ expect }) => {
    // 準備
    const transformer = new WriteOnly();

    // 実行
    const error = await captureRejection(
      transformer.use(createGetContext("k1") as IMiddleware.UseContext, createNext()),
    );

    // 検証
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect(error).toMatchObject({
      name: "UniKvsKeyNotFoundError",
      message: "Key not found: k1",
      meta: { key: "k1" },
    });
  });

  test("use に stream を渡したとき、KeyNotFoundError を投げる", async ({ expect }) => {
    // 準備
    const transformer = new WriteOnly();

    // 実行
    const error = await captureRejection(
      transformer.use(createStreamContext("k1") as IMiddleware.UseContext, createNext()),
    );

    // 検証
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect(error).toMatchObject({
      name: "UniKvsKeyNotFoundError",
      message: "Key not found: k1",
      meta: { key: "k1" },
    });
  });

  test("decode はデータの内容によらず KeyNotFoundError を投げる", async ({ expect }) => {
    // 準備
    const transformer = new WriteOnly();

    // 実行と検証
    for (const data of ["v1", new Uint8Array([1]), null]) {
      const error = await captureRejection(
        transformer.decode(createDecodeContext(data, "k1") as IMiddleware.DecodeContext),
      );

      expect(error).toBeInstanceOf(KeyNotFoundError);
    }
  });
});

describe("書き込みの透過", () => {
  test("use に set を渡したとき、next に委譲する", async ({ expect }) => {
    // 準備
    const transformer = new WriteOnly();
    let called = false;

    // 実行
    await transformer.use(createSetContext("k1") as IMiddleware.UseContext, async () => {
      called = true;
    });

    // 検証
    expect(called).toBe(true);
  });

  test("allowDelete が true のとき、use に delete を渡すと next に委譲する", async ({ expect }) => {
    // 準備
    const transformer = new WriteOnly({ allowDelete: true });
    let called = false;

    // 実行
    await transformer.use(createDeleteContext("k1") as IMiddleware.UseContext, async () => {
      called = true;
    });

    // 検証
    expect(called).toBe(true);
  });
});
