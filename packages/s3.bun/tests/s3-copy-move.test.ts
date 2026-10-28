import { type IStorage, KeyNotFoundError } from "@unikvs/core";
import {
  type TestContextInit,
  TestContext,
  abortedSignal,
  createGetContext,
  createHasContext,
  createSetContext,
} from "@unikvs/testing";
import { describe } from "vite-plus/test";

import { test } from "./_helpers.js";

/**
 * 複製用のコンテキストを組み立てます。
 *
 * @param key 複製元のキーです。
 * @param destinationKey 複製先のキーです。
 * @param init 追加の初期値です。
 *
 * @returns 複製用のコンテキストです。
 */
function createCopyContext(
  key: string,
  destinationKey: string,
  init: Omit<TestContextInit, "action" | "key" | "destinationKey"> = {},
): IStorage.CopyContext {
  return new TestContext({
    ...init,
    action: "copy",
    key,
    destinationKey,
  }) as unknown as IStorage.CopyContext;
}

/**
 * 移動用のコンテキストを組み立てます。
 *
 * @param key 移動元のキーです。
 * @param destinationKey 移動先のキーです。
 * @param init 追加の初期値です。
 *
 * @returns 移動用のコンテキストです。
 */
function createMoveContext(
  key: string,
  destinationKey: string,
  init: Omit<TestContextInit, "action" | "key" | "destinationKey"> = {},
): IStorage.MoveContext {
  return new TestContext({
    ...init,
    action: "move",
    key,
    destinationKey,
  }) as unknown as IStorage.MoveContext;
}

describe("複製と移動", () => {
  test("copy は複製元を残したまま複製先へ書き込む", async ({ expect, signal, storage }) => {
    // 準備：
    const data = new Uint8Array([1, 2, 3]);
    await storage.write(
      createSetContext("copy/source.bin", { signal }) as IStorage.WriteContext,
      data,
    );

    // 実行：
    await storage.copy(createCopyContext("copy/source.bin", "copy/destination.bin", { signal }));

    // 検証：
    await expect(
      storage.read(createGetContext("copy/source.bin", { signal }) as IStorage.ReadContext),
    ).resolves.toStrictEqual(data);
    await expect(
      storage.read(createGetContext("copy/destination.bin", { signal }) as IStorage.ReadContext),
    ).resolves.toStrictEqual(data);
  });

  test("copy は既存の複製先を上書きする", async ({ expect, signal, storage }) => {
    // 準備：
    const data = new Uint8Array([7, 8, 9]);
    await storage.write(
      createSetContext("copy/overwrite-source.bin", { signal }) as IStorage.WriteContext,
      data,
    );

    await storage.write(
      createSetContext("copy/overwrite-destination.bin", { signal }) as IStorage.WriteContext,
      new Uint8Array([1, 2, 3]),
    );

    // 実行：
    await storage.copy(
      createCopyContext("copy/overwrite-source.bin", "copy/overwrite-destination.bin", { signal }),
    );

    // 検証：
    await expect(
      storage.read(
        createGetContext("copy/overwrite-destination.bin", { signal }) as IStorage.ReadContext,
      ),
    ).resolves.toStrictEqual(data);
  });

  test("特殊文字を含むキーも copy できる", async ({ expect, signal, storage }) => {
    // 準備：
    const sourceKey = "copy dir/こんにちは 世界.bin";
    const destinationKey = "copy dir/複製先 🚀.bin";
    const data = new Uint8Array([4, 5, 6]);
    await storage.write(createSetContext(sourceKey, { signal }) as IStorage.WriteContext, data);

    // 実行：
    await storage.copy(createCopyContext(sourceKey, destinationKey, { signal }));

    // 検証：
    await expect(
      storage.read(createGetContext(destinationKey, { signal }) as IStorage.ReadContext),
    ).resolves.toStrictEqual(data);
  });

  test("move は複製先へ書き込んでから複製元を削除する", async ({ expect, signal, storage }) => {
    // 準備：
    const data = new Uint8Array([10, 11, 12]);
    await storage.write(
      createSetContext("move/source.bin", { signal }) as IStorage.WriteContext,
      data,
    );

    // 実行：
    await storage.move(createMoveContext("move/source.bin", "move/destination.bin", { signal }));

    // 検証：
    await expect(
      storage.exists(createHasContext("move/source.bin", { signal }) as IStorage.ExistsContext),
    ).resolves.toBe(false);
    await expect(
      storage.read(createGetContext("move/destination.bin", { signal }) as IStorage.ReadContext),
    ).resolves.toStrictEqual(data);
  });

  test("move は既存の移動先を上書きする", async ({ expect, signal, storage }) => {
    // 準備：
    const data = new Uint8Array([13, 14, 15]);
    await storage.write(
      createSetContext("move/overwrite-source.bin", { signal }) as IStorage.WriteContext,
      data,
    );

    await storage.write(
      createSetContext("move/overwrite-destination.bin", { signal }) as IStorage.WriteContext,
      new Uint8Array([1, 2, 3]),
    );

    // 実行：
    await storage.move(
      createMoveContext("move/overwrite-source.bin", "move/overwrite-destination.bin", { signal }),
    );

    // 検証：
    await expect(
      storage.read(
        createGetContext("move/overwrite-destination.bin", { signal }) as IStorage.ReadContext,
      ),
    ).resolves.toStrictEqual(data);
  });

  test("存在しないキーの copy は KeyNotFoundError を投げる", async ({
    expect,
    signal,
    storage,
  }) => {
    // 実行と検証：
    await expect(
      storage.copy(createCopyContext("copy/missing.bin", "copy/never.bin", { signal })),
    ).rejects.toBeInstanceOf(KeyNotFoundError);
  });

  test("存在しないキーの move は KeyNotFoundError を投げる", async ({
    expect,
    signal,
    storage,
  }) => {
    // 実行と検証：
    await expect(
      storage.move(createMoveContext("move/missing.bin", "move/never.bin", { signal })),
    ).rejects.toBeInstanceOf(KeyNotFoundError);
  });

  test("同じキーへの copy と move は値の存在確認だけを行う", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備：
    const data = new Uint8Array([16, 17, 18]);
    await storage.write(
      createSetContext("same/key.bin", { signal }) as IStorage.WriteContext,
      data,
    );

    // 実行：
    await storage.copy(createCopyContext("same/key.bin", "same/key.bin", { signal }));
    await storage.move(createMoveContext("same/key.bin", "same/key.bin", { signal }));

    // 検証：
    await expect(
      storage.read(createGetContext("same/key.bin", { signal }) as IStorage.ReadContext),
    ).resolves.toStrictEqual(data);
  });

  test("存在しないキーを同じキーへ copy すると KeyNotFoundError を投げる", async ({
    expect,
    signal,
    storage,
  }) => {
    // 実行と検証：
    await expect(
      storage.copy(createCopyContext("same/missing.bin", "same/missing.bin", { signal })),
    ).rejects.toBeInstanceOf(KeyNotFoundError);
  });

  test("存在しないキーを同じキーへ move すると KeyNotFoundError を投げる", async ({
    expect,
    signal,
    storage,
  }) => {
    // 実行と検証：
    await expect(
      storage.move(createMoveContext("same/missing.bin", "same/missing.bin", { signal })),
    ).rejects.toBeInstanceOf(KeyNotFoundError);
  });

  test("中断済みシグナルでの copy と move は中断例外を投げる", async ({ expect, storage }) => {
    // 実行と検証：
    await expect(
      storage.copy(
        createCopyContext("abort/source.bin", "abort/destination.bin", {
          signal: abortedSignal(),
        }),
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    await expect(
      storage.move(
        createMoveContext("abort/source.bin", "abort/destination.bin", {
          signal: abortedSignal(),
        }),
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
