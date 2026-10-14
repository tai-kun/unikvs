import { captureThrown } from "@unikvs/testing";
import { describe, test } from "vitest";

import { WriteOnlyClearNotAllowedError, WriteOnlyDeleteNotAllowedError } from "../src/errors.js";
import WriteOnly from "../src/write-only.js";

describe("onDelete の挙動", () => {
  test("既定では WriteOnlyDeleteNotAllowedError を投げる", ({ expect }) => {
    // 準備
    const transformer = new WriteOnly();

    // 実行
    const error = captureThrown(() => transformer.onDelete({ key: "k1" }));

    // 検証
    expect(error).toBeInstanceOf(WriteOnlyDeleteNotAllowedError);
    expect(error).toMatchObject({
      name: "WriteOnlyDeleteNotAllowedError",
      message: 'WriteOnly.delete with allowDelete false cannot delete key "k1".',
      meta: { key: "k1" },
    });
  });

  test("name は WriteOnlyDeleteNotAllowedError である", ({ expect }) => {
    // 実行
    const error = captureThrown(() => new WriteOnly().onDelete({ key: "k1" }));

    // 検証
    expect((error as WriteOnlyDeleteNotAllowedError).name).toBe("WriteOnlyDeleteNotAllowedError");
  });

  test("allowDelete が true のとき、何もしない", ({ expect }) => {
    // 準備
    const transformer = new WriteOnly({ allowDelete: true });

    // 実行と検証
    expect(() => transformer.onDelete({ key: "k1" })).not.toThrow();
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

describe("onClear の挙動", () => {
  test("既定では WriteOnlyClearNotAllowedError を投げる", ({ expect }) => {
    // 準備
    const transformer = new WriteOnly();

    // 実行
    const error = captureThrown(() => transformer.onClear());

    // 検証
    expect(error).toBeInstanceOf(WriteOnlyClearNotAllowedError);
    expect(error).toMatchObject({
      name: "WriteOnlyClearNotAllowedError",
      message: "WriteOnly.clear with allowDelete false cannot delete all data.",
    });
  });

  test("name は WriteOnlyClearNotAllowedError である", ({ expect }) => {
    // 実行
    const error = captureThrown(() => new WriteOnly().onClear());

    // 検証
    expect((error as WriteOnlyClearNotAllowedError).name).toBe("WriteOnlyClearNotAllowedError");
  });

  test("allowDelete が true のとき、何もしない", ({ expect }) => {
    // 準備
    const transformer = new WriteOnly({ allowDelete: true });

    // 実行と検証
    expect(() => transformer.onClear()).not.toThrow();
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
