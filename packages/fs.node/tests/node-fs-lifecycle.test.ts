import { access, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { IStorage } from "@unikvs/core";
import {
  createClearContext,
  createDeleteContext,
  createGetContext,
  createHasContext,
  createOpenContext,
  createSetContext,
  createStreamContext,
} from "@unikvs/testing";
import { describe } from "vitest";

import NodeFs from "../src/node-fs.js";
import { test } from "./_helpers.js";

describe("ライフサイクル", () => {
  test("name は NodeFs である", ({ expect, storage }) => {
    // 実行と検証
    expect(storage.name).toBe("NodeFs");
  });

  test("close は存在しない", ({ expect, storage }) => {
    // 実行と検証
    expect("close" in storage).toBe(false);
  });

  test("root を省略したとき、既定値 .unikvs が open 時のカレントディレクトリーに作成される", async ({
    expect,
    root,
  }) => {
    // 準備
    const originalCwd = process.cwd();

    try {
      process.chdir(root);
      const storage = new NodeFs();

      // 実行
      await storage.open(createOpenContext() as IStorage.OpenContext);

      // 検証
      expect(storage.isOpen).toBe(true);
      await expect(access(join(root, ".unikvs"))).resolves.toBeUndefined();
    } finally {
      process.chdir(originalCwd);
    }
  });

  test("ネストした存在しないルートを open したとき、再帰的にディレクトリーが作成される", async ({
    expect,
    root,
  }) => {
    // 準備
    const nestedRoot = join(root, "a", "b", "c");
    const storage = new NodeFs(nestedRoot);

    // 実行
    await storage.open(createOpenContext() as IStorage.OpenContext);

    // 検証
    expect(storage.isOpen).toBe(true);
    await expect(access(nestedRoot)).resolves.toBeUndefined();
  });

  test("open 済みのインスタンスを再度 open したとき、保存済みデータが維持される", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const key = "reopen.bin";
    const data = new Uint8Array([1, 2, 3]);
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);

    // 実行
    await storage.open(createOpenContext() as IStorage.OpenContext);

    // 検証
    expect(storage.isOpen).toBe(true);
    expect(
      new Uint8Array(await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext)),
    ).toStrictEqual(data);
  });

  test("生成直後は root ディレクトリーが作成されない", async ({ expect, root }) => {
    // 準備
    const notCreatedRoot = join(root, "not-created");
    const storage = new NodeFs(notCreatedRoot);

    // 実行と検証
    expect(storage.isOpen).toBe(false);
    await expect(access(notCreatedRoot)).rejects.toThrow();
  });

  test("root と同名のファイルがあるとき、open は失敗し isOpen は false のままである", async ({
    expect,
    root,
  }) => {
    // 準備
    const occupiedRoot = join(root, "occupied");
    await writeFile(occupiedRoot, new Uint8Array([1]));
    const storage = new NodeFs(occupiedRoot);

    // 実行と検証
    await expect(storage.open(createOpenContext() as IStorage.OpenContext)).rejects.toThrow();
    expect(storage.isOpen).toBe(false);
  });
});

describe("open 前の操作", () => {
  test("すべての CRUD・ストリーム操作が TypeError で失敗する", async ({ expect, root, signal }) => {
    // 準備
    const storage = new NodeFs(root);
    const key = "before-open.bin";
    const data = new Uint8Array([1]);

    // 実行と検証
    await expect(
      storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data),
    ).rejects.toThrow(TypeError);
    await expect(
      storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
    ).rejects.toThrow(TypeError);
    await expect(storage.exists(createHasContext(key) as IStorage.ExistsContext)).rejects.toThrow(
      TypeError,
    );
    await expect(
      storage.delete(createDeleteContext(key) as IStorage.DeleteContext),
    ).rejects.toThrow(TypeError);
    await expect(storage.clear(createClearContext() as IStorage.ClearContext)).rejects.toThrow(
      TypeError,
    );
    await expect(
      storage.getWritable(createSetContext(key, { signal }) as IStorage.GetWritableContext),
    ).rejects.toThrow(TypeError);
    expect(() =>
      storage.getReadable(createStreamContext(key, { signal }) as IStorage.GetReadableContext),
    ).toThrow(TypeError);
  });
});
