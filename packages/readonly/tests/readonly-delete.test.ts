import type { IMiddleware } from "@unikvs/core";
import {
  captureRejection,
  captureThrown,
  createClearContext,
  createDeleteContext,
  createEncodeContext,
  createNext,
} from "@unikvs/testing";
import { describe, test } from "vitest";

import {
  ReadOnlyClearNotAllowedError,
  ReadOnlyDeleteNotAllowedError,
  ReadOnlySetNotAllowedError,
} from "../src/errors.js";
import ReadOnly from "../src/readonly.js";

describe("use による set の挙動", () => {
  test("ReadOnlySetNotAllowedError を投げる", async ({ expect }) => {
    // 準備
    const transformer = new ReadOnly();

    // 実行
    const error = await captureRejection(
      transformer.encode(
        createEncodeContext("v1", "k1") as IMiddleware.EncodeContext,
        createNext(),
      ),
    );

    // 検証
    expect(error).toBeInstanceOf(ReadOnlySetNotAllowedError);
    expect(error).toMatchObject({
      name: "ReadOnlySetNotAllowedError",
      message: 'ReadOnly.set cannot write key "k1".',
      meta: { key: "k1" },
    });
  });

  test("name は ReadOnlySetNotAllowedError である", async ({ expect }) => {
    // 実行
    const error = await captureRejection(
      new ReadOnly().encode(
        createEncodeContext("v1", "k1") as IMiddleware.EncodeContext,
        createNext(),
      ),
    );

    // 検証
    expect((error as ReadOnlySetNotAllowedError).name).toBe("ReadOnlySetNotAllowedError");
  });

  test("cause を引き継ぐ", ({ expect }) => {
    // 準備
    const cause = new Error("upstream failure");

    // 実行
    const error = captureThrown(() => {
      throw new ReadOnlySetNotAllowedError({ key: "k1", cause });
    });

    // 検証
    expect(error).toBeInstanceOf(ReadOnlySetNotAllowedError);
    expect((error as ReadOnlySetNotAllowedError).cause).toBe(cause);
    expect((error as ReadOnlySetNotAllowedError).meta).toStrictEqual({ key: "k1" });
  });
});

describe("use による delete の挙動", () => {
  test("ReadOnlyDeleteNotAllowedError を投げる", async ({ expect }) => {
    // 準備
    const transformer = new ReadOnly();

    // 実行
    const error = await captureRejection(
      transformer.use(createDeleteContext("k1") as IMiddleware.UseContext, createNext()),
    );

    // 検証
    expect(error).toBeInstanceOf(ReadOnlyDeleteNotAllowedError);
    expect(error).toMatchObject({
      name: "ReadOnlyDeleteNotAllowedError",
      message: 'ReadOnly.delete with allowDelete false cannot delete key "k1".',
      meta: { key: "k1" },
    });
  });

  test("name は ReadOnlyDeleteNotAllowedError である", async ({ expect }) => {
    // 実行
    const error = await captureRejection(
      new ReadOnly().use(createDeleteContext("k1") as IMiddleware.UseContext, createNext()),
    );

    // 検証
    expect((error as ReadOnlyDeleteNotAllowedError).name).toBe("ReadOnlyDeleteNotAllowedError");
  });

  test("allowDelete が true のとき、next に委譲する", async ({ expect }) => {
    // 準備
    const transformer = new ReadOnly({ allowDelete: true });
    let called = false;

    // 実行
    await transformer.use(createDeleteContext("k1") as IMiddleware.UseContext, async () => {
      called = true;
    });

    // 検証
    expect(called).toBe(true);
  });

  test("cause を引き継ぐ", ({ expect }) => {
    // 準備
    const cause = new Error("upstream failure");

    // 実行
    const error = captureThrown(() => {
      throw new ReadOnlyDeleteNotAllowedError({ key: "k1", cause });
    });

    // 検証
    expect(error).toBeInstanceOf(ReadOnlyDeleteNotAllowedError);
    expect((error as ReadOnlyDeleteNotAllowedError).cause).toBe(cause);
    expect((error as ReadOnlyDeleteNotAllowedError).meta).toStrictEqual({ key: "k1" });
  });
});

describe("use による clear の挙動", () => {
  test("ReadOnlyClearNotAllowedError を投げる", async ({ expect }) => {
    // 準備
    const transformer = new ReadOnly();

    // 実行
    const error = await captureRejection(
      transformer.use(createClearContext() as IMiddleware.UseContext, createNext()),
    );

    // 検証
    expect(error).toBeInstanceOf(ReadOnlyClearNotAllowedError);
    expect(error).toMatchObject({
      name: "ReadOnlyClearNotAllowedError",
      message: "ReadOnly.clear with allowDelete false cannot delete all data.",
    });
  });

  test("name は ReadOnlyClearNotAllowedError である", async ({ expect }) => {
    // 実行
    const error = await captureRejection(
      new ReadOnly().use(createClearContext() as IMiddleware.UseContext, createNext()),
    );

    // 検証
    expect((error as ReadOnlyClearNotAllowedError).name).toBe("ReadOnlyClearNotAllowedError");
  });

  test("allowDelete が true のとき、next に委譲する", async ({ expect }) => {
    // 準備
    const transformer = new ReadOnly({ allowDelete: true });
    let called = false;

    // 実行
    await transformer.use(createClearContext() as IMiddleware.UseContext, async () => {
      called = true;
    });

    // 検証
    expect(called).toBe(true);
  });

  test("cause を引き継ぐ", ({ expect }) => {
    // 準備
    const cause = new Error("upstream failure");

    // 実行
    const error = captureThrown(() => {
      throw new ReadOnlyClearNotAllowedError({ cause });
    });

    // 検証
    expect(error).toBeInstanceOf(ReadOnlyClearNotAllowedError);
    expect((error as ReadOnlyClearNotAllowedError).cause).toBe(cause);
  });
});
