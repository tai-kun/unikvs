import { captureThrown } from "@unikvs/testing";
import { describe, test } from "vitest";

import {
  ReadOnlyClearNotAllowedError,
  ReadOnlyDeleteNotAllowedError,
  ReadOnlySetNotAllowedError,
} from "../src/errors.js";

describe("エラーの構築", () => {
  const cause = new Error("upstream failure");

  test("ReadOnlySetNotAllowedError は cause を引き継ぐ", ({ expect }) => {
    // 実行
    const error = captureThrown(() => {
      throw new ReadOnlySetNotAllowedError({ key: "k1", cause });
    });

    // 検証
    expect(error).toBeInstanceOf(ReadOnlySetNotAllowedError);
    expect((error as ReadOnlySetNotAllowedError).cause).toBe(cause);
    expect((error as ReadOnlySetNotAllowedError).meta).toStrictEqual({ key: "k1" });
  });

  test("ReadOnlyDeleteNotAllowedError は cause を引き継ぐ", ({ expect }) => {
    // 実行
    const error = captureThrown(() => {
      throw new ReadOnlyDeleteNotAllowedError({ key: "k1", cause });
    });

    // 検証
    expect(error).toBeInstanceOf(ReadOnlyDeleteNotAllowedError);
    expect((error as ReadOnlyDeleteNotAllowedError).cause).toBe(cause);
    expect((error as ReadOnlyDeleteNotAllowedError).meta).toStrictEqual({ key: "k1" });
  });

  test("ReadOnlyClearNotAllowedError は cause を引き継ぐ", ({ expect }) => {
    // 実行
    const error = captureThrown(() => {
      throw new ReadOnlyClearNotAllowedError({ cause });
    });

    // 検証
    expect(error).toBeInstanceOf(ReadOnlyClearNotAllowedError);
    expect((error as ReadOnlyClearNotAllowedError).cause).toBe(cause);
    expect((error as ReadOnlyClearNotAllowedError).meta).toBe(undefined);
  });
});
