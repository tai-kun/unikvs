import type { IStorage } from "@unikvs/core";
import {
  createGetContext,
  createHasContext,
  createSetContext,
  createOpenContext,
} from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

import CloudflareR2 from "../src/cloudflare-r2.js";
import { KeyNotFoundError } from "../src/errors.js";
import { createFakeBucket, createCopyContext, createMoveContext } from "./_fake-bucket.js";

const { signal } = new AbortController();

function createStorage(bucket = createFakeBucket()): CloudflareR2 {
  const storage = new CloudflareR2({ bucket });
  storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

  return storage;
}

async function writeBytes(
  storage: CloudflareR2,
  key: string,
  data: Uint8Array<ArrayBuffer>,
): Promise<void> {
  await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);
}

async function readBytes(storage: CloudflareR2, key: string): Promise<Uint8Array<ArrayBuffer>> {
  return storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);
}

describe("コピー (copy) の振る舞い", () => {
  test("複製元を残したまま複製先へバイト列を書き込む", async ({ expect }) => {
    // 準備：
    const storage = createStorage();
    await writeBytes(storage, "source", new Uint8Array([1, 2, 3]));

    // 実行：
    await storage.copy(
      createCopyContext("source", "destination", { signal }) as IStorage.CopyContext,
    );

    // 検証：
    expect(await readBytes(storage, "source")).toStrictEqual(new Uint8Array([1, 2, 3]));
    expect(await readBytes(storage, "destination")).toStrictEqual(new Uint8Array([1, 2, 3]));
  });

  test("複製先に既存の値があるとき、上書きする", async ({ expect }) => {
    // 準備：
    const storage = createStorage();
    await writeBytes(storage, "source", new Uint8Array([1]));
    await writeBytes(storage, "destination", new Uint8Array([9]));

    // 実行：
    await storage.copy(
      createCopyContext("source", "destination", { signal }) as IStorage.CopyContext,
    );

    // 検証：
    expect(await readBytes(storage, "destination")).toStrictEqual(new Uint8Array([1]));
  });

  test("複製元と複製先が同じキーのとき、値を残したまま成功する", async ({ expect }) => {
    // 準備：
    const storage = createStorage();
    await writeBytes(storage, "same", new Uint8Array([4, 5]));

    // 実行と検証：
    await expect(
      storage.copy(createCopyContext("same", "same", { signal }) as IStorage.CopyContext),
    ).resolves.toBeUndefined();
    expect(await readBytes(storage, "same")).toStrictEqual(new Uint8Array([4, 5]));
  });

  test("複製元が存在しないとき、KeyNotFoundError で拒否される", async ({ expect }) => {
    // 準備：
    const storage = createStorage();

    // 実行と検証：
    await expect(
      storage.copy(createCopyContext("missing", "destination", { signal }) as IStorage.CopyContext),
    ).rejects.toThrow(KeyNotFoundError);
  });
});

describe("移動 (move) の振る舞い", () => {
  test("移動先へバイト列を書き込み、移動元を削除する", async ({ expect }) => {
    // 準備：
    const storage = createStorage();
    await writeBytes(storage, "source", new Uint8Array([1, 2, 3]));

    // 実行：
    await storage.move(
      createMoveContext("source", "destination", { signal }) as IStorage.MoveContext,
    );

    // 検証：
    expect(
      await storage.exists(createHasContext("source", { signal }) as IStorage.ExistsContext),
    ).toBe(false);
    expect(await readBytes(storage, "destination")).toStrictEqual(new Uint8Array([1, 2, 3]));
  });

  test("移動先に既存の値があるとき、上書きする", async ({ expect }) => {
    // 準備：
    const storage = createStorage();
    await writeBytes(storage, "source", new Uint8Array([1]));
    await writeBytes(storage, "destination", new Uint8Array([9]));

    // 実行：
    await storage.move(
      createMoveContext("source", "destination", { signal }) as IStorage.MoveContext,
    );

    // 検証：
    expect(
      await storage.exists(createHasContext("source", { signal }) as IStorage.ExistsContext),
    ).toBe(false);
    expect(await readBytes(storage, "destination")).toStrictEqual(new Uint8Array([1]));
  });

  test("移動元と移動先が同じキーのとき、値を残したまま成功する", async ({ expect }) => {
    // 準備：
    const storage = createStorage();
    await writeBytes(storage, "same", new Uint8Array([4, 5]));

    // 実行と検証：
    await expect(
      storage.move(createMoveContext("same", "same", { signal }) as IStorage.MoveContext),
    ).resolves.toBeUndefined();
    expect(await readBytes(storage, "same")).toStrictEqual(new Uint8Array([4, 5]));
  });

  test("移動元が存在しないとき、KeyNotFoundError で拒否される", async ({ expect }) => {
    // 準備：
    const storage = createStorage();

    // 実行と検証：
    await expect(
      storage.move(createMoveContext("missing", "destination", { signal }) as IStorage.MoveContext),
    ).rejects.toThrow(KeyNotFoundError);
  });

  test("移動先の書き込みに失敗したとき、移動元を残す", async ({ expect }) => {
    // 準備：
    const bucket = createFakeBucket();
    await bucket.put("source", new Uint8Array([1, 2, 3]));

    const storage = createStorage(bucket);

    bucket.put = async (): Promise<null> => {
      throw new Error("write failed");
    };

    // 実行：
    const error = await storage
      .move(createMoveContext("source", "destination", { signal }) as IStorage.MoveContext)
      .catch((ex: unknown) => ex);

    // 検証：
    expect(error).toBeInstanceOf(Error);

    expect(bucket.store.has("source")).toBe(true);
    expect(bucket.store.has("destination")).toBe(false);
    expect(await readBytes(storage, "source")).toStrictEqual(new Uint8Array([1, 2, 3]));
  });
});
