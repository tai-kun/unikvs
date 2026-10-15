import { access, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { IStorage } from "@unikvs/core";
import {
  createClearContext,
  createDeleteContext,
  createGetContext,
  createHasContext,
  createSetContext,
} from "@unikvs/testing";
import { listTemporaryFiles } from "@unikvs/testing/node";
import { describe } from "vitest";

import { test } from "./_helpers.js";

describe("CRUD の詳細", () => {
  test("既存キーを上書きしたとき、古い内容が残らず新しい内容だけになる", async ({
    expect,
    root,
    signal,
    storage,
  }) => {
    // 準備
    const key = "overwrite.bin";
    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      new Uint8Array([1, 1, 1, 1, 1, 1]),
    );

    // 実行
    const next = new Uint8Array([2, 2]);
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, next);

    // 検証
    const info = await stat(join(root, key));
    expect(info.size).toBe(next.length);
    expect(
      new Uint8Array(await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext)),
    ).toStrictEqual(next);
  });

  test("読み取り結果のバイト列を変更しても保存データは変わらない", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const key = "immutable.bin";
    const original = new Uint8Array([7, 8, 9]);
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, original);

    // 実行
    const first = await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);
    first[0] = 0;

    // 検証
    expect(
      new Uint8Array(await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext)),
    ).toStrictEqual(original);
  });

  test("write が成功した後、一時ファイルは残らない", async ({ expect, root, signal, storage }) => {
    // 準備と実行
    await storage.write(
      createSetContext("no-tmp.bin", { signal }) as IStorage.WriteContext,
      new Uint8Array([1, 2]),
    );

    // 検証
    expect(await listTemporaryFiles(root)).toStrictEqual([]);
  });

  test("存在しないキーを削除したとき、ENOENT エラーが投げられる", async ({ expect, storage }) => {
    // 実行と検証
    await expect(
      storage.delete(createDeleteContext("missing.bin") as IStorage.DeleteContext),
    ).rejects.toThrow(/ENOENT/);
  });

  test("削除したキーへ再度書き込める", async ({ expect, signal, storage }) => {
    // 準備
    const key = "rewrite.bin";
    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    await storage.delete(createDeleteContext(key) as IStorage.DeleteContext);

    // 実行
    const data = new Uint8Array([2, 3]);
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);

    // 検証
    expect(await storage.exists(createHasContext(key) as IStorage.ExistsContext)).toBe(true);
    expect(
      new Uint8Array(await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext)),
    ).toStrictEqual(data);
  });

  test("clear はネストしたディレクトリーごと削除し、空のルートを作り直す", async ({
    expect,
    root,
    signal,
    storage,
  }) => {
    // 準備
    await storage.write(
      createSetContext("top.bin", { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    await mkdir(join(root, "nested"));
    await writeFile(join(root, "nested", "inner.bin"), new Uint8Array([2]));

    // 実行
    await storage.clear(createClearContext() as IStorage.ClearContext);

    // 検証
    await expect(access(root)).resolves.toBeUndefined();
    expect(await readdir(root)).toStrictEqual([]);
  });

  test("空のストレージで clear を実行してもルートは残る", async ({ expect, root, storage }) => {
    // 実行
    await storage.clear(createClearContext() as IStorage.ClearContext);

    // 検証
    await expect(access(root)).resolves.toBeUndefined();
    expect(await readdir(root)).toStrictEqual([]);
  });

  test("ルートが外部から削除されていても clear で作り直される", async ({
    expect,
    root,
    signal,
    storage,
  }) => {
    // 準備
    await storage.write(
      createSetContext("gone.bin", { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    await rm(root, { recursive: true, force: true });

    // 実行
    await storage.clear(createClearContext() as IStorage.ClearContext);

    // 検証
    await expect(access(root)).resolves.toBeUndefined();
    expect(await readdir(root)).toStrictEqual([]);
  });

  test("clear の後も同じキーへ書き込める", async ({ expect, signal, storage }) => {
    // 準備
    const key = "after-clear.bin";
    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    await storage.clear(createClearContext() as IStorage.ClearContext);

    // 実行
    const data = new Uint8Array([9, 8]);
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);

    // 検証
    expect(
      new Uint8Array(await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext)),
    ).toStrictEqual(data);
  });

  test("キーはルート直下のフラットなファイルとして保存される", async ({
    expect,
    root,
    signal,
    storage,
  }) => {
    // 準備と実行
    await storage.write(
      createSetContext("flat.txt", { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

    // 検証
    expect(await readdir(root)).toStrictEqual(["flat.txt"]);
  });
});
