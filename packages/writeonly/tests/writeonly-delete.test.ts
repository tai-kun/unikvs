import type { IMiddleware } from "@unikvs/core";
import {
  captureRejection,
  captureThrown,
  createClearContext,
  createDeleteContext,
  createNext,
} from "@unikvs/testing";
import { describe, test } from "vitest";

import { WriteOnlyClearNotAllowedError, WriteOnlyDeleteNotAllowedError } from "../src/errors.js";
import WriteOnly from "../src/write-only.js";

describe("use による delete の挙動", () => {
  test("既定では WriteOnlyDeleteNotAllowedError を投げる", async ({ expect }) => {
    // 準備
    const transformer = new WriteOnly();

    // 実行
    const error = await captureRejection(
      transformer.use(createDeleteContext("k1") as IMiddleware.UseContext, createNext()),
    );

    // 検証
    expect(error).toBeInstanceOf(WriteOnlyDeleteNotAllowedError);
    expect(error).toMatchObject({
      name: "WriteOnlyDeleteNotAllowedError",
      message: 'WriteOnly.delete with allowDelete false cannot delete key "k1".',
      meta: { key: "k1" },
    });
  });

  test("name は WriteOnlyDeleteNotAllowedError である", async ({ expect }) => {
    // 実行
    const error = await captureRejection(
      new WriteOnly().use(createDeleteContext("k1") as IMiddleware.UseContext, createNext()),
    );

    // 検証
    expect((error as WriteOnlyDeleteNotAllowedError).name).toBe("WriteOnlyDeleteNotAllowedError");
  });

  test("allowDelete が true のとき、next に委譲する", async ({ expect }) => {
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

  test("cause を引き継ぐ", ({ expect }) => {
    // 準備
    const cause = new Error("upstream failure");

    // 実行
    const error = captureThrown(() => {
      throw new WriteOnlyDeleteNotAllowedError({ key: "k1", cause });
    });

    // 検証
    expect(error).toBeInstanceOf(WriteOnlyDeleteNotAllowedError);
    expect((error as WriteOnlyDeleteNotAllowedError).cause).toBe(cause);
    expect((error as WriteOnlyDeleteNotAllowedError).meta).toStrictEqual({ key: "k1" });
  });
});

describe("use による clear の挙動", () => {
  test("既定では WriteOnlyClearNotAllowedError を投げる", async ({ expect }) => {
    // 準備
    const transformer = new WriteOnly();

    // 実行
    const error = await captureRejection(
      transformer.use(createClearContext() as IMiddleware.UseContext, createNext()),
    );

    // 検証
    expect(error).toBeInstanceOf(WriteOnlyClearNotAllowedError);
    expect(error).toMatchObject({
      name: "WriteOnlyClearNotAllowedError",
      message: "WriteOnly.clear with allowDelete false cannot delete all data.",
    });
  });

  test("name は WriteOnlyClearNotAllowedError である", async ({ expect }) => {
    // 実行
    const error = await captureRejection(
      new WriteOnly().use(createClearContext() as IMiddleware.UseContext, createNext()),
    );

    // 検証
    expect((error as WriteOnlyClearNotAllowedError).name).toBe("WriteOnlyClearNotAllowedError");
  });

  test("allowDelete が true のとき、next に委譲する", async ({ expect }) => {
    // 準備
    const transformer = new WriteOnly({ allowDelete: true });
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
      throw new WriteOnlyClearNotAllowedError({ cause });
    });

    // 検証
    expect(error).toBeInstanceOf(WriteOnlyClearNotAllowedError);
    expect((error as WriteOnlyClearNotAllowedError).cause).toBe(cause);
  });
});
