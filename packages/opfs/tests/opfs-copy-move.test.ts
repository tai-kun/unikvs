import { type IStorage, KeyNotFoundError } from "@unikvs/core";
import { createGetContext, createHasContext, createSetContext } from "@unikvs/testing";
import { InvalidFilenameError } from "@unikvs/utils";
import { describe } from "vite-plus/test";

import { test, createCopyContext, createMoveContext } from "./_helpers.js";

const { signal } = new AbortController();
describe("コピー (copy) の振る舞い", () => {
  test("複製元を残したまま複製先へバイト列を書き込む", async ({ expect, storage }) => {
    // 準備：
    await storage.write(
      createSetContext("source.bin", { signal }) as IStorage.WriteContext,
      new Uint8Array([1, 2, 3]),
    );

    // 実行：
    await storage.copy(
      createCopyContext("source.bin", "destination.bin", { signal }) as IStorage.CopyContext,
    );

    // 検証：
    expect(
      await storage.read(createGetContext("source.bin", { signal }) as IStorage.ReadContext),
    ).toStrictEqual(new Uint8Array([1, 2, 3]));
    expect(
      await storage.read(createGetContext("destination.bin", { signal }) as IStorage.ReadContext),
    ).toStrictEqual(new Uint8Array([1, 2, 3]));
  });

  test("複製先に既存のファイルがあるとき、上書きする", async ({ expect, storage }) => {
    // 準備：
    await storage.write(
      createSetContext("source.bin", { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    await storage.write(
      createSetContext("destination.bin", { signal }) as IStorage.WriteContext,
      new Uint8Array([9]),
    );

    // 実行：
    await storage.copy(
      createCopyContext("source.bin", "destination.bin", { signal }) as IStorage.CopyContext,
    );

    // 検証：
    expect(
      await storage.read(createGetContext("destination.bin", { signal }) as IStorage.ReadContext),
    ).toStrictEqual(new Uint8Array([1]));
  });

  test("複製元と複製先が同じキーのとき、ファイルを残したまま成功する", async ({
    expect,
    storage,
  }) => {
    // 準備：
    await storage.write(
      createSetContext("same.bin", { signal }) as IStorage.WriteContext,
      new Uint8Array([4, 5]),
    );

    // 実行と検証：
    await expect(
      storage.copy(createCopyContext("same.bin", "same.bin", { signal }) as IStorage.CopyContext),
    ).resolves.toBeUndefined();
    expect(
      await storage.read(createGetContext("same.bin", { signal }) as IStorage.ReadContext),
    ).toStrictEqual(new Uint8Array([4, 5]));
  });

  test("複製元が存在しないとき、KeyNotFoundError で拒否される", async ({ expect, storage }) => {
    // 実行と検証：
    await expect(
      storage.copy(
        createCopyContext("missing.bin", "destination.bin", {
          signal,
        }) as IStorage.CopyContext,
      ),
    ).rejects.toThrow(KeyNotFoundError);
  });
});
describe("移動 (move) の振る舞い", () => {
  test("移動先へバイト列を書き込み、移動元を削除する", async ({ expect, storage }) => {
    // 準備：
    await storage.write(
      createSetContext("source.bin", { signal }) as IStorage.WriteContext,
      new Uint8Array([1, 2, 3]),
    );

    // 実行：
    await storage.move(
      createMoveContext("source.bin", "destination.bin", { signal }) as IStorage.MoveContext,
    );

    // 検証：
    expect(
      await storage.exists(createHasContext("source.bin", { signal }) as IStorage.ExistsContext),
    ).toBe(false);
    expect(
      await storage.read(createGetContext("destination.bin", { signal }) as IStorage.ReadContext),
    ).toStrictEqual(new Uint8Array([1, 2, 3]));
  });

  test("移動先に既存のファイルがあるとき、上書きする", async ({ expect, storage }) => {
    // 準備：
    await storage.write(
      createSetContext("source.bin", { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    await storage.write(
      createSetContext("destination.bin", { signal }) as IStorage.WriteContext,
      new Uint8Array([9]),
    );

    // 実行：
    await storage.move(
      createMoveContext("source.bin", "destination.bin", { signal }) as IStorage.MoveContext,
    );

    // 検証：
    expect(
      await storage.exists(createHasContext("source.bin", { signal }) as IStorage.ExistsContext),
    ).toBe(false);
    expect(
      await storage.read(createGetContext("destination.bin", { signal }) as IStorage.ReadContext),
    ).toStrictEqual(new Uint8Array([1]));
  });

  test("移動元と移動先が同じキーのとき、ファイルを残したまま成功する", async ({
    expect,
    storage,
  }) => {
    // 準備：
    await storage.write(
      createSetContext("same.bin", { signal }) as IStorage.WriteContext,
      new Uint8Array([4, 5]),
    );

    // 実行と検証：
    await expect(
      storage.move(createMoveContext("same.bin", "same.bin", { signal }) as IStorage.MoveContext),
    ).resolves.toBeUndefined();
    expect(
      await storage.read(createGetContext("same.bin", { signal }) as IStorage.ReadContext),
    ).toStrictEqual(new Uint8Array([4, 5]));
  });

  test("移動元が存在しないとき、KeyNotFoundError で拒否される", async ({ expect, storage }) => {
    // 実行と検証：
    await expect(
      storage.move(
        createMoveContext("missing.bin", "destination.bin", {
          signal,
        }) as IStorage.MoveContext,
      ),
    ).rejects.toThrow(KeyNotFoundError);
  });

  test("移動先の書き込みに失敗したとき、移動元を残す", async ({ expect, storage }) => {
    // 準備：
    await storage.write(
      createSetContext("source.bin", { signal }) as IStorage.WriteContext,
      new Uint8Array([1, 2, 3]),
    );

    // 実行：
    const error = await storage
      .move(
        createMoveContext("source.bin", "dir/destination.bin", {
          signal,
        }) as IStorage.MoveContext,
      )
      .catch((ex: unknown) => ex);

    // 検証：
    expect(error).toBeInstanceOf(InvalidFilenameError);

    expect(
      await storage.exists(createHasContext("source.bin", { signal }) as IStorage.ExistsContext),
    ).toBe(true);
    expect(
      await storage.read(createGetContext("source.bin", { signal }) as IStorage.ReadContext),
    ).toStrictEqual(new Uint8Array([1, 2, 3]));
  });
});
