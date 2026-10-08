import { InvalidUsageErrorBase } from "@unikvs/core";
import { describe } from "vitest";

import { KeyNotFoundError, UnsupportedRuntimeError } from "../src/errors.js";
import { test } from "./_helpers.js";

describe("KeyNotFoundError", () => {
  test("name は RedisKeyNotFoundError である", ({ expect }) => {
    // 準備と実行
    const error = new KeyNotFoundError({ key: "k1" });

    // 検証
    expect(error.name).toBe("RedisKeyNotFoundError");
  });

  test("meta と一度だけ整形されたメッセージを保持する", ({ expect }) => {
    // 準備と実行
    const error = new KeyNotFoundError({ key: "k1" });

    // 検証
    expect(error.meta).toStrictEqual({ key: "k1" });
    expect(error.message).toBe("Key not found: k1");
  });
});

describe("UnsupportedRuntimeError", () => {
  test("name は RedisUnsupportedRuntimeError である", ({ expect }) => {
    // 準備と実行
    const error = new UnsupportedRuntimeError();

    // 検証
    expect(error.name).toBe("RedisUnsupportedRuntimeError");
  });

  test("InvalidUsageErrorBase を継承している", ({ expect }) => {
    // 準備と実行
    const error = new UnsupportedRuntimeError();

    // 検証
    expect(error).toBeInstanceOf(InvalidUsageErrorBase);
  });

  test("既定のメッセージを持つ", ({ expect }) => {
    // 準備と実行
    const error = new UnsupportedRuntimeError();

    // 検証
    expect(error.message).toBe("Redis can only be used in the Bun runtime");
  });
});

describe("存在しないキー", () => {
  test("read は KeyNotFoundError で失敗する", async ({ expect, signal, storage }) => {
    // 準備
    const key = "missing.bin";

    // 実行と検証
    await expect(storage.read({ key, signal })).rejects.toThrow(KeyNotFoundError);
  });
});

describe("中断された signal", () => {
  test("write は拒否される", async ({ expect, storage }) => {
    // 準備
    const controller = new AbortController();
    controller.abort();

    // 実行と検証
    await expect(
      storage.write({
        key: "aborted.bin",
        data: new Uint8Array([1]),
        signal: controller.signal,
        vars: {},
      }),
    ).rejects.toThrow();
  });

  test("read は拒否される", async ({ expect, signal, storage }) => {
    // 準備
    const key = "aborted-read.bin";
    await storage.write({ key, data: new Uint8Array([1]), signal, vars: {} });
    const controller = new AbortController();
    controller.abort();

    // 実行と検証
    await expect(storage.read({ key, signal: controller.signal })).rejects.toThrow();
  });

  test("exists は拒否される", async ({ expect, storage }) => {
    // 準備
    const controller = new AbortController();
    controller.abort();

    // 実行と検証
    await expect(
      storage.exists({ key: "aborted.bin", signal: controller.signal }),
    ).rejects.toThrow();
  });

  test("delete は拒否される", async ({ expect, storage }) => {
    // 準備
    const controller = new AbortController();
    controller.abort();

    // 実行と検証
    await expect(
      storage.delete({ key: "aborted.bin", signal: controller.signal }),
    ).rejects.toThrow();
  });

  test("clear は拒否される", async ({ expect, storage }) => {
    // 準備
    const controller = new AbortController();
    controller.abort();

    // 実行と検証
    await expect(storage.clear({ signal: controller.signal })).rejects.toThrow();
  });
});
