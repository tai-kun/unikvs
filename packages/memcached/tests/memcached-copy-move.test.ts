import type { IStorage } from "@unikvs/core";
import {
  TestContext,
  abortedSignal,
  captureRejection,
  createGetContext,
  createHasContext,
  createSetContext,
  createOpenContext,
  createCloseContext,
} from "@unikvs/testing";
import { vi, describe } from "vite-plus/test";

import { KeyNotFoundError } from "../src/errors.js";
import Memcached from "../src/memcached.js";
import { test } from "./_helpers.js";

/**
 * 複製コンテキストを作ります。
 *
 * `@unikvs/testing` の公開エントリに専用ヘルパーが揃うまでのローカル実装です。
 */
function createCopyContext(
  key: string,
  destinationKey: string,
  init: { readonly signal?: AbortSignal | undefined } = {},
): IStorage.CopyContext {
  return new TestContext({
    key,
    action: "copy",
    signal: init.signal,
    destinationKey,
  }) as unknown as IStorage.CopyContext;
}

/**
 * 移動コンテキストを作ります。
 *
 * `@unikvs/testing` の公開エントリに専用ヘルパーが揃うまでのローカル実装です。
 */
function createMoveContext(
  key: string,
  destinationKey: string,
  init: { readonly signal?: AbortSignal | undefined } = {},
): IStorage.MoveContext {
  return new TestContext({
    key,
    action: "move",
    signal: init.signal,
    destinationKey,
  }) as unknown as IStorage.MoveContext;
}

describe("コピー", () => {
  test("複製元を残したまま複製先へ同じ値を作る", async ({
    client,
    expect,
    signal,
    storage,
    keyPrefix,
  }) => {
    // 準備：
    const data = new Uint8Array([1, 2, 3]);
    await storage.write(
      createSetContext("copy-src.bin", { signal }) as IStorage.WriteContext,
      data,
    );

    // 実行：
    await storage.copy(createCopyContext("copy-src.bin", "copy-dest.bin", { signal }));

    // 検証：
    await expect(
      storage.read(createGetContext("copy-src.bin", { signal }) as IStorage.ReadContext),
    ).resolves.toStrictEqual(data);
    await expect(
      storage.read(createGetContext("copy-dest.bin", { signal }) as IStorage.ReadContext),
    ).resolves.toStrictEqual(data);
    // 複製先にも設定されたプレフィックスが付与される。
    expect(client.setCalls.at(-1)).toStrictEqual({
      key: `${keyPrefix}copy-dest.bin`,
      value: "AQID",
      expires: 0,
    });
  });

  test("既存の複製先を上書きする", async ({ expect, signal, storage }) => {
    // 準備：
    const source = new Uint8Array([1, 2, 3]);
    await storage.write(
      createSetContext("overwrite-src.bin", { signal }) as IStorage.WriteContext,
      source,
    );

    await storage.write(
      createSetContext("overwrite-dest.bin", { signal }) as IStorage.WriteContext,
      new Uint8Array([9, 9, 9, 9]),
    );

    // 実行：
    await storage.copy(
      createCopyContext("overwrite-src.bin", "overwrite-dest.bin", {
        signal,
      }),
    );

    // 検証：
    await expect(
      storage.read(createGetContext("overwrite-dest.bin", { signal }) as IStorage.ReadContext),
    ).resolves.toStrictEqual(source);
  });

  test("存在しないキーの複製は KeyNotFoundError になる", async ({ expect, signal, storage }) => {
    // 実行と検証：
    await expect(
      storage.copy(createCopyContext("missing-copy.bin", "copy-dest.bin", { signal })),
    ).rejects.toThrow(KeyNotFoundError);
  });

  test("同じキーへの複製は値を残したまま成功する", async ({ expect, signal, storage }) => {
    // 準備：
    const data = new Uint8Array([4, 5, 6]);
    await storage.write(
      createSetContext("same-copy.bin", { signal }) as IStorage.WriteContext,
      data,
    );

    // 実行：
    await storage.copy(createCopyContext("same-copy.bin", "same-copy.bin", { signal }));

    // 検証：
    await expect(
      storage.read(createGetContext("same-copy.bin", { signal }) as IStorage.ReadContext),
    ).resolves.toStrictEqual(data);
  });

  test("同じキーへの複製でも存在しなければ KeyNotFoundError になる", async ({
    expect,
    signal,
    storage,
  }) => {
    // 実行と検証：
    await expect(
      storage.copy(
        createCopyContext("missing-same-copy.bin", "missing-same-copy.bin", {
          signal,
        }),
      ),
    ).rejects.toThrow(KeyNotFoundError);
  });

  test("ttlSeconds を指定したとき、複製先にも有効期限が渡される", async ({
    client,
    expect,
    signal,
    keyPrefix,
  }) => {
    // 準備：
    const storage = new Memcached(undefined, {
      client,
      keyPrefix,
      ttlSeconds: 60,
    });
    await storage.open(createOpenContext() as IStorage.OpenContext);

    try {
      await storage.write(
        createSetContext("ttl-copy-src.bin", { signal }) as IStorage.WriteContext,
        new Uint8Array([1]),
      );

      // 実行：
      await storage.copy(
        createCopyContext("ttl-copy-src.bin", "ttl-copy-dest.bin", {
          signal,
        }),
      );

      // 検証：
      expect(client.setCalls.at(-1)).toStrictEqual({
        key: `${keyPrefix}ttl-copy-dest.bin`,
        value: "AQ==",
        expires: 60,
      });
    } finally {
      await storage.close(createCloseContext() as IStorage.CloseContext);
    }
  });

  test("中断済みシグナルでの複製は拒否される", async ({ expect, storage }) => {
    // 準備：
    const signal = abortedSignal();

    // 実行：
    const error = await captureRejection(
      storage.copy(
        createCopyContext("aborted-copy.bin", "aborted-copy-dest.bin", {
          signal,
        }),
      ),
    );

    // 検証：
    expect(error).toHaveProperty("name", "AbortError");
  });
});

describe("移動", () => {
  test("移動先へ値を移し、移動元を削除する", async ({
    client,
    expect,
    signal,
    storage,
    keyPrefix,
  }) => {
    // 準備：
    const data = new Uint8Array([7, 8, 9]);
    await storage.write(
      createSetContext("move-src.bin", { signal }) as IStorage.WriteContext,
      data,
    );

    // 実行：
    await storage.move(createMoveContext("move-src.bin", "move-dest.bin", { signal }));

    // 検証：
    await expect(
      storage.read(createGetContext("move-dest.bin", { signal }) as IStorage.ReadContext),
    ).resolves.toStrictEqual(data);
    await expect(
      storage.exists(createHasContext("move-src.bin", { signal }) as IStorage.ExistsContext),
    ).resolves.toBe(false);
    await expect(
      storage.read(createGetContext("move-src.bin", { signal }) as IStorage.ReadContext),
    ).rejects.toThrow(KeyNotFoundError);
    expect(client.setCalls.at(-1)?.key).toBe(`${keyPrefix}move-dest.bin`);
  });

  test("既存の移動先を上書きする", async ({ expect, signal, storage }) => {
    // 準備：
    const source = new Uint8Array([1, 1, 1]);
    await storage.write(
      createSetContext("move-overwrite-src.bin", { signal }) as IStorage.WriteContext,
      source,
    );

    await storage.write(
      createSetContext("move-overwrite-dest.bin", { signal }) as IStorage.WriteContext,
      new Uint8Array([2, 2, 2, 2]),
    );

    // 実行：
    await storage.move(
      createMoveContext("move-overwrite-src.bin", "move-overwrite-dest.bin", {
        signal,
      }),
    );

    // 検証：
    await expect(
      storage.read(createGetContext("move-overwrite-dest.bin", { signal }) as IStorage.ReadContext),
    ).resolves.toStrictEqual(source);
    await expect(
      storage.exists(
        createHasContext("move-overwrite-src.bin", { signal }) as IStorage.ExistsContext,
      ),
    ).resolves.toBe(false);
  });

  test("存在しないキーの移動は KeyNotFoundError になる", async ({ expect, signal, storage }) => {
    // 実行と検証：
    await expect(
      storage.move(createMoveContext("missing-move.bin", "move-dest.bin", { signal })),
    ).rejects.toThrow(KeyNotFoundError);
  });

  test("同じキーへの移動は値を残したまま成功する", async ({ expect, signal, storage }) => {
    // 準備：
    const data = new Uint8Array([10, 11, 12]);
    await storage.write(
      createSetContext("same-move.bin", { signal }) as IStorage.WriteContext,
      data,
    );

    // 実行：
    await storage.move(createMoveContext("same-move.bin", "same-move.bin", { signal }));

    // 検証：
    await expect(
      storage.read(createGetContext("same-move.bin", { signal }) as IStorage.ReadContext),
    ).resolves.toStrictEqual(data);
  });

  test("同じキーへの移動でも存在しなければ KeyNotFoundError になる", async ({
    expect,
    signal,
    storage,
  }) => {
    // 実行と検証：
    await expect(
      storage.move(
        createMoveContext("missing-same-move.bin", "missing-same-move.bin", {
          signal,
        }),
      ),
    ).rejects.toThrow(KeyNotFoundError);
  });

  test("移動先の書き込みに失敗したとき、移動元を残す", async ({
    client,
    expect,
    signal,
    storage,
  }) => {
    // 準備：
    const data = new Uint8Array([1, 2, 3]);
    await storage.write(
      createSetContext("move-fail-src.bin", { signal }) as IStorage.WriteContext,
      data,
    );

    const failure = new Error("set failed");
    const spy = vi.spyOn(client, "set").mockRejectedValueOnce(failure);

    try {
      // 実行：
      const error = await captureRejection(
        storage.move(
          createMoveContext("move-fail-src.bin", "move-fail-dest.bin", {
            signal,
          }),
        ),
      );

      // 検証：
      expect(error).toBe(failure);

      await expect(
        storage.read(createGetContext("move-fail-src.bin", { signal }) as IStorage.ReadContext),
      ).resolves.toStrictEqual(data);
      await expect(
        storage.exists(
          createHasContext("move-fail-dest.bin", { signal }) as IStorage.ExistsContext,
        ),
      ).resolves.toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  test("ttlSeconds を指定したとき、移動先にも有効期限が渡される", async ({
    client,
    expect,
    signal,
    keyPrefix,
  }) => {
    // 準備：
    const storage = new Memcached(undefined, {
      client,
      keyPrefix,
      ttlSeconds: 60,
    });
    await storage.open(createOpenContext() as IStorage.OpenContext);

    try {
      await storage.write(
        createSetContext("ttl-move-src.bin", { signal }) as IStorage.WriteContext,
        new Uint8Array([1]),
      );

      // 実行：
      await storage.move(
        createMoveContext("ttl-move-src.bin", "ttl-move-dest.bin", {
          signal,
        }),
      );

      // 検証：
      expect(client.setCalls.at(-1)).toStrictEqual({
        key: `${keyPrefix}ttl-move-dest.bin`,
        value: "AQ==",
        expires: 60,
      });
    } finally {
      await storage.close(createCloseContext() as IStorage.CloseContext);
    }
  });

  test("中断済みシグナルでの移動は拒否される", async ({ expect, storage }) => {
    // 準備：
    const signal = abortedSignal();

    // 実行：
    const error = await captureRejection(
      storage.move(
        createMoveContext("aborted-move.bin", "aborted-move-dest.bin", {
          signal,
        }),
      ),
    );

    // 検証：
    expect(error).toHaveProperty("name", "AbortError");
  });
});
