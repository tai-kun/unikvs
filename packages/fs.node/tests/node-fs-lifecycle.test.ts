import { access, writeFile } from "node:fs/promises";
import { join } from "node:path";

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
      await storage.open();

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
    await storage.open();

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
    await storage.write({ key, data, signal });

    // 実行
    await storage.open();

    // 検証
    expect(storage.isOpen).toBe(true);
    expect(new Uint8Array(await storage.read({ key, signal }))).toStrictEqual(data);
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
    await expect(storage.open()).rejects.toThrow();
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
    await expect(storage.write({ key, data, signal })).rejects.toThrow(TypeError);
    await expect(storage.read({ key, signal })).rejects.toThrow(TypeError);
    await expect(storage.exists({ key })).rejects.toThrow(TypeError);
    await expect(storage.delete({ key })).rejects.toThrow(TypeError);
    await expect(storage.clear()).rejects.toThrow(TypeError);
    await expect(storage.getWritable({ key })).rejects.toThrow(TypeError);
    expect(() => storage.getReadable({ key, signal })).toThrow(TypeError);
  });
});
