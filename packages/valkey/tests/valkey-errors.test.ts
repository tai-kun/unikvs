import type { IStorage } from "@unikvs/core";
import {
  createClearContext,
  createDeleteContext,
  createGetContext,
  createHasContext,
  createSetContext,
  createStreamContext,
} from "@unikvs/testing";
import { describe, vi } from "vitest";

import {
  CloseTimeoutError,
  ClusterNotSupportedError,
  ConnectTimeoutError,
  InvalidCloseTimeoutError,
  InvalidTtlError,
  KeyNotFoundError,
} from "../src/errors.js";
import Valkey from "../src/valkey.js";
import { createStorage, test } from "./_helpers.js";

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
  test("name は ValkeyClusterNotSupportedError である", ({ expect }) => {
    // 準備と実行
    const error = new ClusterNotSupportedError();

    // 検証
    expect(error.name).toBe("ValkeyClusterNotSupportedError");
    expect(error.message).toContain("standalone");
  });

  test("cluster を指定したとき、コンストラクタが拒否する", ({ expect, keyPrefix }) => {
    // 準備と実行と検証
    expect(
      () =>
        new Valkey(undefined, {
          keyPrefix,
          cluster: { nodes: [{ host: "127.0.0.1", port: 6379 }] },
        }),
    ).toThrow(ClusterNotSupportedError);
  });
});

describe("InvalidCloseTimeoutError", () => {
  test("name は ValkeyInvalidCloseTimeoutError である", ({ expect }) => {
    // 準備と実行
    const error = new InvalidCloseTimeoutError({ actual: 0 });

    // 検証
    expect(error.name).toBe("ValkeyInvalidCloseTimeoutError");
  });

  test("meta と一度だけ整形されたメッセージを保持する", ({ expect }) => {
    // 準備と実行
    const error = new InvalidCloseTimeoutError({ actual: 0 });

    // 検証
    expect(error.meta).toStrictEqual({ actual: 0 });
    expect(error.message).toContain("`closeTimeout` must be a finite positive number");
  });

  test("有限の正数でない closeTimeout のとき、コンストラクタが拒否する", ({
    expect,
    keyPrefix,
  }) => {
    // 準備と実行と検証
    for (const closeTimeout of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => new Valkey(undefined, { keyPrefix, closeTimeout })).toThrow(
        InvalidCloseTimeoutError,
      );
    }
  });
});

describe("InvalidTtlError", () => {
  test("name は ValkeyInvalidTtlError である", ({ expect }) => {
    // 準備と実行
    const error = new InvalidTtlError({ actual: 0 });

    // 検証
    expect(error.name).toBe("ValkeyInvalidTtlError");
  });

  test("meta と一度だけ整形されたメッセージを保持する", ({ expect }) => {
    // 準備と実行
    const error = new InvalidTtlError({ actual: 0 });

    // 検証
    expect(error.meta).toStrictEqual({ actual: 0 });
    expect(error.message).toContain("`ttl` must be a finite positive number");
  });

  test("有限の正数でない ttl のとき、コンストラクタが拒否する", ({ expect, keyPrefix }) => {
    // 準備と実行と検証
    for (const ttl of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => new Valkey(undefined, { keyPrefix, ttl })).toThrow(InvalidTtlError);
    }
  });
});

describe("ConnectTimeoutError", () => {
  test("name は ValkeyConnectTimeoutError である", ({ expect }) => {
    // 準備と実行
    const error = new ConnectTimeoutError({ timeoutMs: 1000 });

    // 検証
    expect(error.name).toBe("ValkeyConnectTimeoutError");
  });

  test("meta と一度だけ整形されたメッセージを保持する", ({ expect }) => {
    // 準備と実行
    const error = new ConnectTimeoutError({ timeoutMs: 1000 });

    // 検証
    expect(error.meta).toStrictEqual({ timeoutMs: 1000 });
    expect(error.message).toBe("Timed out connecting to Valkey after 1000ms");
  });
});

describe("CloseTimeoutError", () => {
  test("name は ValkeyCloseTimeoutError である", ({ expect }) => {
    // 準備と実行
    const error = new CloseTimeoutError({ timeoutMs: 100 });

    // 検証
    expect(error.name).toBe("ValkeyCloseTimeoutError");
  });

  test("meta と一度だけ整形されたメッセージを保持する", ({ expect }) => {
    // 準備と実行
    const error = new CloseTimeoutError({ timeoutMs: 100 });

    // 検証
    expect(error.meta).toStrictEqual({ timeoutMs: 100 });
    expect(error.message).toBe("Timed out closing Valkey after 100ms");
  });
});

describe("存在しないキー", () => {
  test("read は KeyNotFoundError で失敗する", async ({ expect, signal, storage }) => {
    // 準備
    const key = "missing.bin";

    // 実行と検証
    await expect(
      storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
    ).rejects.toThrow(KeyNotFoundError);
  });

  test("getReadable の pull は KeyNotFoundError で失敗する", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const key = "missing-stream.bin";
    const readable = storage.getReadable(
      createStreamContext(key, { signal }) as IStorage.GetReadableContext,
    );

    // 実行と検証
    const reader = readable.getReader();
    await expect(reader.read()).rejects.toThrow(KeyNotFoundError);
  });
});

describe("中断された signal", () => {
  test("write は拒否される", async ({ expect, storage }) => {
    // 準備
    const controller = new AbortController();
    controller.abort();

    // 実行と検証
    await expect(
      storage.write(
        createSetContext("aborted.bin", { signal: controller.signal }) as IStorage.WriteContext,
        new Uint8Array([1]),
      ),
    ).rejects.toThrow();
  });

  test("read は拒否される", async ({ expect, signal, storage }) => {
    // 準備
    const key = "aborted-read.bin";
    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    const controller = new AbortController();
    controller.abort();

    // 実行と検証
    await expect(
      storage.read(createGetContext(key, { signal: controller.signal }) as IStorage.ReadContext),
    ).rejects.toThrow();
  });

  test("exists は拒否される", async ({ expect, storage }) => {
    // 準備
    const controller = new AbortController();
    controller.abort();

    // 実行と検証
    await expect(
      storage.exists(
        createHasContext("aborted.bin", { signal: controller.signal }) as IStorage.ExistsContext,
      ),
    ).rejects.toThrow();
  });

  test("delete は拒否される", async ({ expect, storage }) => {
    // 準備
    const controller = new AbortController();
    controller.abort();

    // 実行と検証
    await expect(
      storage.delete(
        createDeleteContext("aborted.bin", { signal: controller.signal }) as IStorage.DeleteContext,
      ),
    ).rejects.toThrow();
  });

  test("clear は拒否される", async ({ expect, storage }) => {
    // 準備
    const controller = new AbortController();
    controller.abort();

    // 実行と検証
    await expect(
      storage.clear(createClearContext("", { signal: controller.signal }) as IStorage.ClearContext),
    ).rejects.toThrow();
  });

  test("clear は SCAN の途中でも中断できる", async ({ expect, fake, signal, storage }) => {
    // 準備
    // 1 ページ (COUNT 1000) に収まらない件数を作り、次のページへ進む前に中断する。
    const count = 1001;
    for (let index = 0; index < count; index += 1) {
      await storage.write(
        createSetContext(`bulk/${index}.bin`, { signal }) as IStorage.WriteContext,
        new Uint8Array([index % 256]),
      );
    }
    const controller = new AbortController();
    const scan = fake.scan.bind(fake);
    vi.spyOn(fake, "scan").mockImplementationOnce(async (cursor, ...args) => {
      controller.abort();
      return scan(cursor, ...args);
    });

    // 実行と検証
    await expect(
      storage.clear(createClearContext("", { signal: controller.signal }) as IStorage.ClearContext),
    ).rejects.toThrow();
  });

  test("getWritable は同期エラーになる", ({ expect, storage }) => {
    // 準備
    const controller = new AbortController();
    controller.abort();

    // 実行と検証
    expect(() =>
      storage.getWritable(
        createSetContext("aborted.bin", {
          signal: controller.signal,
        }) as IStorage.GetWritableContext,
      ),
    ).toThrow();
  });

  test("getReadable は同期エラーになる", ({ expect, storage }) => {
    // 準備
    const controller = new AbortController();
    controller.abort();

    // 実行と検証
    expect(() =>
      storage.getReadable(
        createStreamContext("aborted.bin", {
          signal: controller.signal,
        }) as IStorage.GetReadableContext,
      ),
    ).toThrow();
  });
});

describe("初期化と接続管理", () => {
  test("ストレージ名は Valkey である", ({ expect, storage }) => {
    // 準備と実行は constructor で完了している。

    // 検証
    expect(storage.name).toBe("Valkey");
  });

  test("初期状態のとき、isOpen は false である", ({ expect, fake, keyPrefix }) => {
    // 準備
    const unopened = createStorage(fake, keyPrefix);

    // 実行と検証
    expect(unopened.isOpen).toBe(false);
  });

  test("open を実行したとき、isOpen が true になる", ({ expect, storage }) => {
    // 実行と検証
    expect(storage.isOpen).toBe(true);
  });
});
