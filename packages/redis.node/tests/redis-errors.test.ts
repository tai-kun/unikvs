import { describe } from "vitest";

import {
  CloseTimeoutError,
  ClusterNotSupportedError,
  ConnectTimeoutError,
  InvalidCloseTimeoutError,
  KeyNotFoundError,
} from "../src/errors.js";
import { test } from "./_helpers.js";

describe("KeyNotFoundError", () => {
  test("name は UniKvsKeyNotFoundError である", ({ expect }) => {
    // 準備と実行
    const error = new KeyNotFoundError({ key: "k1" });

    // 検証
    expect(error.name).toBe("UniKvsKeyNotFoundError");
  });

  test("meta と一度だけ整形されたメッセージを保持する", ({ expect }) => {
    // 準備と実行
    const error = new KeyNotFoundError({ key: "k1" });

    // 検証
    expect(error.meta).toStrictEqual({ key: "k1" });
    expect(error.message).toBe("Key not found: k1");
  });
});

describe("ClusterNotSupportedError", () => {
  test("name は RedisClusterNotSupportedError である", ({ expect }) => {
    // 準備と実行
    const error = new ClusterNotSupportedError();

    // 検証
    expect(error.name).toBe("RedisClusterNotSupportedError");
    expect(error.message).toContain("standalone");
  });
});

describe("InvalidCloseTimeoutError", () => {
  test("name は RedisInvalidCloseTimeoutError である", ({ expect }) => {
    // 準備と実行
    const error = new InvalidCloseTimeoutError({ actual: 0 });

    // 検証
    expect(error.name).toBe("RedisInvalidCloseTimeoutError");
  });

  test("meta と一度だけ整形されたメッセージを保持する", ({ expect }) => {
    // 準備と実行
    const error = new InvalidCloseTimeoutError({ actual: 0 });

    // 検証
    expect(error.meta).toStrictEqual({ actual: 0 });
    expect(error.message).toContain("`closeTimeout` must be a finite positive number");
  });
});

describe("ConnectTimeoutError", () => {
  test("name は RedisConnectTimeoutError である", ({ expect }) => {
    // 準備と実行
    const error = new ConnectTimeoutError({ timeoutMs: 1000 });

    // 検証
    expect(error.name).toBe("RedisConnectTimeoutError");
  });

  test("meta と一度だけ整形されたメッセージを保持する", ({ expect }) => {
    // 準備と実行
    const error = new ConnectTimeoutError({ timeoutMs: 1000 });

    // 検証
    expect(error.meta).toStrictEqual({ timeoutMs: 1000 });
    expect(error.message).toBe("Timed out connecting to Redis after 1000ms");
  });
});

describe("CloseTimeoutError", () => {
  test("name は RedisCloseTimeoutError である", ({ expect }) => {
    // 準備と実行
    const error = new CloseTimeoutError({ timeoutMs: 100 });

    // 検証
    expect(error.name).toBe("RedisCloseTimeoutError");
  });

  test("meta と一度だけ整形されたメッセージを保持する", ({ expect }) => {
    // 準備と実行
    const error = new CloseTimeoutError({ timeoutMs: 100 });

    // 検証
    expect(error.meta).toStrictEqual({ timeoutMs: 100 });
    expect(error.message).toBe("Timed out closing Redis after 100ms");
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
