import { access, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe } from "vitest";

import BunFs from "../src/bun-fs.js";
import { test } from "./_helpers.js";

describe("ライフサイクル", () => {
  test("name は BunFs である", ({ expect, storage }) => {
    // 実行と検証
    expect(storage.name).toBe("BunFs");
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
      const defaultRoot = new BunFs();

      // 実行
      await defaultRoot.open();

      // 検証
      expect(defaultRoot.isOpen).toBe(true);
      await expect(access(join(root, ".unikvs"))).resolves.toBeNull();
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
    const nested = new BunFs(nestedRoot);

    // 実行
    await nested.open();

    // 検証
    expect(nested.isOpen).toBe(true);
    await expect(access(nestedRoot)).resolves.toBeNull();
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
    const unopened = new BunFs(notCreatedRoot);

    // 実行と検証
    expect(unopened.isOpen).toBe(false);
    await expect(access(notCreatedRoot)).rejects.toThrow();
  });

  test("root と同名のファイルがあるとき、open は失敗し isOpen は false のままである", async ({
    expect,
    root,
  }) => {
    // 準備
    const occupiedRoot = join(root, "occupied");
    await writeFile(occupiedRoot, new Uint8Array([1]));
    const occupied = new BunFs(occupiedRoot);

    // 実行と検証
    await expect(occupied.open()).rejects.toThrow();
    expect(occupied.isOpen).toBe(false);
  });
});

describe("open 前の操作", () => {
  test("すべての CRUD・ストリーム操作が TypeError で失敗する", async ({ expect, root, signal }) => {
    // 準備
    const unopened = new BunFs(root);
    const key = "before-open.bin";
    const data = new Uint8Array([1]);

    // 実行と検証
    await expect(unopened.write({ key, data, signal })).rejects.toThrow(TypeError);
    await expect(unopened.read({ key, signal })).rejects.toThrow(TypeError);
    await expect(unopened.exists({ key })).rejects.toThrow(TypeError);
    await expect(unopened.delete({ key })).rejects.toThrow(TypeError);
    await expect(unopened.clear()).rejects.toThrow(TypeError);
    await expect(unopened.getWritable({ key, signal })).rejects.toThrow(TypeError);
    expect(() => unopened.getReadable({ key, signal })).toThrow(TypeError);
  });
});
