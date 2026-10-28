import type { IStorage } from "@unikvs/core";
import {
  TestContext,
  abortedSignal,
  captureRejection,
  createGetContext,
  createHasContext,
  createSetContext,
} from "@unikvs/testing";
import { vi, test, expect, describe } from "vite-plus/test";

import { KeyNotFoundError } from "../src/errors.js";
import { closeStorage, createStorage } from "./_helpers.js";

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
  test("複製元を残したまま複製先へ同じ値を作る", async () => {
    const { client, signal, storage, keyPrefix } = await createStorage();

    try {
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
      expect([...client.store.keys()].sort()).toStrictEqual([
        `${keyPrefix}copy-dest.bin`,
        `${keyPrefix}copy-src.bin`,
      ]);
    } finally {
      await closeStorage(storage);
    }
  });

  test("既存の複製先を上書きする", async () => {
    const { signal, storage } = await createStorage();

    try {
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
    } finally {
      await closeStorage(storage);
    }
  });

  test("存在しないキーの複製は KeyNotFoundError になる", async () => {
    const { signal, storage } = await createStorage();

    try {
      // 実行と検証：
      await expect(
        storage.copy(
          createCopyContext("missing-copy.bin", "copy-dest.bin", {
            signal,
          }),
        ),
      ).rejects.toThrow(KeyNotFoundError);
    } finally {
      await closeStorage(storage);
    }
  });

  test("同じキーへの複製は値を残したまま成功する", async () => {
    const { signal, storage } = await createStorage();

    try {
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
    } finally {
      await closeStorage(storage);
    }
  });

  test("同じキーへの複製でも存在しなければ KeyNotFoundError になる", async () => {
    const { signal, storage } = await createStorage();

    try {
      // 実行と検証：
      await expect(
        storage.copy(
          createCopyContext("missing-same-copy.bin", "missing-same-copy.bin", {
            signal,
          }),
        ),
      ).rejects.toThrow(KeyNotFoundError);
    } finally {
      await closeStorage(storage);
    }
  });

  test("リース設定があるとき、複製先にも同じ設定で書き込む", async () => {
    const { client, signal, storage } = await createStorage({ leaseTtlSeconds: 30 });

    try {
      // 準備：
      await storage.write(
        createSetContext("lease-copy-src.bin", { signal }) as IStorage.WriteContext,
        new Uint8Array([1]),
      );

      // 実行：
      await storage.copy(
        createCopyContext("lease-copy-src.bin", "lease-copy-dest.bin", {
          signal,
        }),
      );

      // 検証：
      expect(client.puts.at(-1)?.options).toStrictEqual({ leaseTtlSeconds: 30 });
    } finally {
      await closeStorage(storage);
    }
  });

  test("中断済みシグナルでの複製は拒否される", async () => {
    const { storage } = await createStorage();

    try {
      // 準備：
      const reason = new Error("独自の中断理由");
      const aborted = abortedSignal(reason);

      // 実行と検証：
      await expect(
        storage.copy(
          createCopyContext("aborted-copy.bin", "aborted-copy-dest.bin", {
            signal: aborted,
          }),
        ),
      ).rejects.toBe(reason);
    } finally {
      await closeStorage(storage);
    }
  });
});

describe("移動", () => {
  test("移動先へ値を移し、移動元を削除する", async () => {
    const { client, signal, storage, keyPrefix } = await createStorage();

    try {
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
      expect([...client.store.keys()]).toStrictEqual([`${keyPrefix}move-dest.bin`]);
    } finally {
      await closeStorage(storage);
    }
  });

  test("既存の移動先を上書きする", async () => {
    const { signal, storage } = await createStorage();

    try {
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
        storage.read(
          createGetContext("move-overwrite-dest.bin", { signal }) as IStorage.ReadContext,
        ),
      ).resolves.toStrictEqual(source);
      await expect(
        storage.exists(
          createHasContext("move-overwrite-src.bin", { signal }) as IStorage.ExistsContext,
        ),
      ).resolves.toBe(false);
    } finally {
      await closeStorage(storage);
    }
  });

  test("存在しないキーの移動は KeyNotFoundError になる", async () => {
    const { signal, storage } = await createStorage();

    try {
      // 実行と検証：
      await expect(
        storage.move(
          createMoveContext("missing-move.bin", "move-dest.bin", {
            signal,
          }),
        ),
      ).rejects.toThrow(KeyNotFoundError);
    } finally {
      await closeStorage(storage);
    }
  });

  test("同じキーへの移動は値を残したまま成功する", async () => {
    const { signal, storage } = await createStorage();

    try {
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
    } finally {
      await closeStorage(storage);
    }
  });

  test("同じキーへの移動でも存在しなければ KeyNotFoundError になる", async () => {
    const { signal, storage } = await createStorage();

    try {
      // 実行と検証：
      await expect(
        storage.move(
          createMoveContext("missing-same-move.bin", "missing-same-move.bin", {
            signal,
          }),
        ),
      ).rejects.toThrow(KeyNotFoundError);
    } finally {
      await closeStorage(storage);
    }
  });

  test("移動先の書き込みに失敗したとき、移動元を残す", async () => {
    const { client, signal, storage } = await createStorage();

    try {
      // 準備：
      const data = new Uint8Array([1, 2, 3]);
      await storage.write(
        createSetContext("move-fail-src.bin", { signal }) as IStorage.WriteContext,
        data,
      );

      const failure = new Error("put failed");
      const spy = vi.spyOn(client, "put").mockRejectedValueOnce(failure);

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
    } finally {
      await closeStorage(storage);
    }
  });

  test("リース設定があるとき、移動先にも同じ設定で書き込む", async () => {
    const { client, signal, storage } = await createStorage({ leaseTtlSeconds: 30 });

    try {
      // 準備：
      await storage.write(
        createSetContext("lease-move-src.bin", { signal }) as IStorage.WriteContext,
        new Uint8Array([1]),
      );

      // 実行：
      await storage.move(
        createMoveContext("lease-move-src.bin", "lease-move-dest.bin", {
          signal,
        }),
      );

      // 検証：
      expect(client.puts.at(-1)?.options).toStrictEqual({ leaseTtlSeconds: 30 });
    } finally {
      await closeStorage(storage);
    }
  });

  test("中断済みシグナルでの移動は拒否される", async () => {
    const { storage } = await createStorage();

    try {
      // 準備：
      const reason = new Error("独自の中断理由");
      const aborted = abortedSignal(reason);

      // 実行と検証：
      await expect(
        storage.move(
          createMoveContext("aborted-move.bin", "aborted-move-dest.bin", {
            signal: aborted,
          }),
        ),
      ).rejects.toBe(reason);
    } finally {
      await closeStorage(storage);
    }
  });
});
