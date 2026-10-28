import { rm, stat, mkdir, access, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { type IStorage, KeyNotFoundError } from "@unikvs/core";
import {
  createGetContext,
  createHasContext,
  createSetContext,
  createCopyContext,
  createMoveContext,
  createClearContext,
  createDeleteContext,
} from "@unikvs/testing";
import { listTemporaryFiles } from "@unikvs/testing/node";
import { describe } from "vite-plus/test";

import { test } from "./_helpers.js";

describe("CRUD の詳細", () => {
  test("既存キーを上書きしたとき、古い内容が残らず新しい内容だけになる", async ({
    root,
    expect,
    signal,
    storage,
  }) => {
    // 準備：
    const key = "overwrite.bin";
    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      new Uint8Array([1, 1, 1, 1, 1, 1]),
    );

    // 実行：
    const next = new Uint8Array([2, 2]);
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, next);

    // 検証：
    const info = await stat(join(root, key));
    expect(info.size).toBe(next.length);

    expect(
      new Uint8Array(await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext)),
    ).toStrictEqual(next);
  });

  test("copy で別のキーへ複製したとき、コピー元とコピー先の両方に同じ内容が残る", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備：
    const source = "copy-source.bin";
    const destination = "copy-destination.bin";
    const data = new Uint8Array([1, 2, 3]);
    await storage.write(createSetContext(source, { signal }) as IStorage.WriteContext, data);

    // 実行：
    await storage.copy(createCopyContext(source, destination, { signal }) as IStorage.CopyContext);

    // 検証：
    expect(
      new Uint8Array(
        await storage.read(createGetContext(source, { signal }) as IStorage.ReadContext),
      ),
    ).toStrictEqual(data);
    expect(
      new Uint8Array(
        await storage.read(createGetContext(destination, { signal }) as IStorage.ReadContext),
      ),
    ).toStrictEqual(data);
  });

  test("copy のコピー先に既存の値があるとき、上書きされる", async ({ expect, signal, storage }) => {
    // 準備：
    const source = "copy-overwrite-source.bin";
    const destination = "copy-overwrite-destination.bin";
    const data = new Uint8Array([9, 8, 7]);
    await storage.write(createSetContext(source, { signal }) as IStorage.WriteContext, data);
    await storage.write(
      createSetContext(destination, { signal }) as IStorage.WriteContext,
      new Uint8Array([1, 1, 1, 1]),
    );

    // 実行：
    await storage.copy(createCopyContext(source, destination, { signal }) as IStorage.CopyContext);

    // 検証：
    expect(
      new Uint8Array(
        await storage.read(createGetContext(destination, { signal }) as IStorage.ReadContext),
      ),
    ).toStrictEqual(data);
  });

  test("copy のコピー元が存在しないとき、KeyNotFoundError が投げられる", async ({
    expect,
    signal,
    storage,
  }) => {
    // 実行と検証：
    await expect(
      storage.copy(
        createCopyContext("copy-missing.bin", "copy-missing-dest.bin", {
          signal,
        }) as IStorage.CopyContext,
      ),
    ).rejects.toThrow(KeyNotFoundError);
  });

  test("copy のコピー元とコピー先が同じとき、存在確認だけでデータが残る", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備：
    const key = "copy-same.bin";
    const data = new Uint8Array([4, 5]);
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);

    // 実行：
    await storage.copy(createCopyContext(key, key, { signal }) as IStorage.CopyContext);

    // 検証：
    expect(
      new Uint8Array(await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext)),
    ).toStrictEqual(data);
  });

  test("move で別のキーへ移動したとき、移動先に内容が移り移動元が消える", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備：
    const source = "move-source.bin";
    const destination = "move-destination.bin";
    const data = new Uint8Array([6, 7, 8]);
    await storage.write(createSetContext(source, { signal }) as IStorage.WriteContext, data);

    // 実行：
    await storage.move(createMoveContext(source, destination, { signal }) as IStorage.MoveContext);

    // 検証：
    expect(await storage.exists(createHasContext(source) as IStorage.ExistsContext)).toBe(false);
    expect(
      new Uint8Array(
        await storage.read(createGetContext(destination, { signal }) as IStorage.ReadContext),
      ),
    ).toStrictEqual(data);
  });

  test("move の移動先に既存の値があるとき、上書きされる", async ({ expect, signal, storage }) => {
    // 準備：
    const source = "move-overwrite-source.bin";
    const destination = "move-overwrite-destination.bin";
    const data = new Uint8Array([3, 2, 1]);
    await storage.write(createSetContext(source, { signal }) as IStorage.WriteContext, data);
    await storage.write(
      createSetContext(destination, { signal }) as IStorage.WriteContext,
      new Uint8Array([1, 1, 1, 1]),
    );

    // 実行：
    await storage.move(createMoveContext(source, destination, { signal }) as IStorage.MoveContext);

    // 検証：
    expect(
      new Uint8Array(
        await storage.read(createGetContext(destination, { signal }) as IStorage.ReadContext),
      ),
    ).toStrictEqual(data);
  });

  test("move の移動元が存在しないとき、KeyNotFoundError が投げられる", async ({
    expect,
    signal,
    storage,
  }) => {
    // 実行と検証：
    await expect(
      storage.move(
        createMoveContext("move-missing.bin", "move-missing-dest.bin", {
          signal,
        }) as IStorage.MoveContext,
      ),
    ).rejects.toThrow(KeyNotFoundError);
  });

  test("move の移動元と移動先が同じとき、存在確認だけでデータが残る", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備：
    const key = "move-same.bin";
    const data = new Uint8Array([0, 1]);
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);

    // 実行：
    await storage.move(createMoveContext(key, key, { signal }) as IStorage.MoveContext);

    // 検証：
    expect(
      new Uint8Array(await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext)),
    ).toStrictEqual(data);
  });

  test("move の移動先への書き込みが失敗したとき、移動元が残る", async ({
    root,
    expect,
    signal,
    storage,
  }) => {
    // 準備：移動先と同じ名前のディレクトリーを作り、リネームを失敗させます。
    const source = "move-blocked-source.bin";
    const destination = "move-blocked-destination.bin";
    const data = new Uint8Array([5, 4, 3]);
    await storage.write(createSetContext(source, { signal }) as IStorage.WriteContext, data);
    await mkdir(join(root, destination));

    // 実行と検証：
    await expect(
      storage.move(createMoveContext(source, destination, { signal }) as IStorage.MoveContext),
    ).rejects.toThrow();
    expect(
      new Uint8Array(
        await storage.read(createGetContext(source, { signal }) as IStorage.ReadContext),
      ),
    ).toStrictEqual(data);
  });

  test("読み取り結果のバイト列を変更しても保存データは変わらない", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備：
    const key = "immutable.bin";
    const original = new Uint8Array([7, 8, 9]);
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, original);

    // 実行：
    const first = await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);
    first[0] = 0;

    // 検証：
    expect(
      new Uint8Array(await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext)),
    ).toStrictEqual(original);
  });

  test("write が成功した後、一時ファイルは残らない", async ({ root, expect, signal, storage }) => {
    // 準備と実行。
    await storage.write(
      createSetContext("no-tmp.bin", { signal }) as IStorage.WriteContext,
      new Uint8Array([1, 2]),
    );

    // 検証：
    expect(await listTemporaryFiles(root)).toStrictEqual([]);
  });

  test("存在しないキーを削除したとき、ENOENT エラーが投げられる", async ({ expect, storage }) => {
    // 実行と検証：
    await expect(
      storage.delete(createDeleteContext("missing.bin") as IStorage.DeleteContext),
    ).rejects.toThrow(/ENOENT/u);
  });

  test("削除したキーへ再度書き込める", async ({ expect, signal, storage }) => {
    // 準備：
    const key = "rewrite.bin";
    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    await storage.delete(createDeleteContext(key) as IStorage.DeleteContext);

    // 実行：
    const data = new Uint8Array([2, 3]);
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);

    // 検証：
    expect(await storage.exists(createHasContext(key) as IStorage.ExistsContext)).toBe(true);
    expect(
      new Uint8Array(await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext)),
    ).toStrictEqual(data);
  });

  test("clear はネストしたディレクトリーごと削除し、空のルートを作り直す", async ({
    root,
    expect,
    signal,
    storage,
  }) => {
    // 準備：
    await storage.write(
      createSetContext("top.bin", { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    await mkdir(join(root, "nested"));
    await writeFile(join(root, "nested", "inner.bin"), new Uint8Array([2]));

    // 実行：
    await storage.clear(createClearContext() as IStorage.ClearContext);

    // 検証：
    await expect(access(root)).resolves.toBeUndefined();
    expect(await readdir(root)).toStrictEqual([]);
  });

  test("空のストレージで clear を実行してもルートは残る", async ({ root, expect, storage }) => {
    // 実行：
    await storage.clear(createClearContext() as IStorage.ClearContext);

    // 検証：
    await expect(access(root)).resolves.toBeUndefined();
    expect(await readdir(root)).toStrictEqual([]);
  });

  test("ルートが外部から削除されていても clear で作り直される", async ({
    root,
    expect,
    signal,
    storage,
  }) => {
    // 準備：
    await storage.write(
      createSetContext("gone.bin", { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    await rm(root, {
      force: true,
      recursive: true,
    });

    // 実行：
    await storage.clear(createClearContext() as IStorage.ClearContext);

    // 検証：
    await expect(access(root)).resolves.toBeUndefined();
    expect(await readdir(root)).toStrictEqual([]);
  });

  test("clear の後も同じキーへ書き込める", async ({ expect, signal, storage }) => {
    // 準備：
    const key = "after-clear.bin";
    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

    await storage.clear(createClearContext() as IStorage.ClearContext);

    // 実行：
    const data = new Uint8Array([9, 8]);
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);

    // 検証：
    expect(
      new Uint8Array(await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext)),
    ).toStrictEqual(data);
  });

  test("キーはルート直下のフラットなファイルとして保存される", async ({
    root,
    expect,
    signal,
    storage,
  }) => {
    // 準備と実行。
    await storage.write(
      createSetContext("flat.txt", { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

    // 検証：
    expect(await readdir(root)).toStrictEqual(["flat.txt"]);
  });
});
