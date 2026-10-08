import { chmod, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe } from "vitest";

import { listTemporaryFiles, test } from "./_helpers.js";

const isPermissionTestSupported = process.platform !== "win32" && process.getuid?.() !== 0;

describe("権限エラー", () => {
  test.skipIf(!isPermissionTestSupported)(
    "書き込み権限のないルートでは write が EACCES で失敗する",
    async ({ expect, root, signal, storage }) => {
      // 準備
      await chmod(root, 0o500);

      try {
        // 実行と検証
        await expect(
          storage.write({ key: "denied.bin", data: new Uint8Array([1]), signal, vars: {} }),
        ).rejects.toThrow(/EACCES/);
        expect(await listTemporaryFiles(root)).toStrictEqual([]);
      } finally {
        await chmod(root, 0o700);
      }
    },
  );

  test.skipIf(!isPermissionTestSupported)(
    "読み取り権限のないファイルの read は EACCES で失敗する",
    async ({ expect, root, signal, storage }) => {
      // 準備
      const key = "no-read.bin";
      await storage.write({ key, data: new Uint8Array([1]), signal, vars: {} });
      await chmod(join(root, key), 0o000);

      try {
        // 実行と検証
        await expect(storage.read({ key, signal })).rejects.toThrow(/EACCES/);
      } finally {
        await chmod(join(root, key), 0o600);
      }
    },
  );
});

describe("abort された signal", () => {
  test("read は失敗する", async ({ expect, signal, storage }) => {
    // 準備
    const key = "aborted-read.bin";
    await storage.write({ key, data: new Uint8Array([1]), signal, vars: {} });
    const controller = new AbortController();
    controller.abort();

    // 実行と検証
    await expect(storage.read({ key, signal: controller.signal })).rejects.toThrow();
  });
});

describe("rename 失敗時の保全", () => {
  test("ストリーム書き込みの close で rename が失敗したとき、既存ディレクトリーと中身が保たれる", async ({
    expect,
    root,
    signal,
    storage,
  }) => {
    // 準備
    const key = "conflict.bin";
    const innerData = new Uint8Array([7, 7]);
    await mkdir(join(root, key));
    await writeFile(join(root, key, "inner.txt"), innerData);
    const writer = (await storage.getWritable({ key, signal, vars: {} })).getWriter();
    await writer.write(new Uint8Array([1, 2, 3]));

    // 実行と検証
    await expect(writer.close()).rejects.toThrow();
    expect(await readdir(join(root, key))).toStrictEqual(["inner.txt"]);
    expect(new Uint8Array(await readFile(join(root, key, "inner.txt")))).toStrictEqual(innerData);
    expect(await listTemporaryFiles(root)).toStrictEqual([]);
  });

  test("通常 write で rename が失敗したとき、既存ディレクトリーと中身が保たれる", async ({
    expect,
    root,
    signal,
    storage,
  }) => {
    // 準備
    const key = "conflict2.bin";
    const innerData = new Uint8Array([7]);
    await mkdir(join(root, key));
    await writeFile(join(root, key, "inner.txt"), innerData);

    // 実行と検証
    await expect(
      storage.write({ key, data: new Uint8Array([1]), signal, vars: {} }),
    ).rejects.toThrow();
    expect(await readdir(join(root, key))).toStrictEqual(["inner.txt"]);
    expect(new Uint8Array(await readFile(join(root, key, "inner.txt")))).toStrictEqual(innerData);
    expect(await listTemporaryFiles(root)).toStrictEqual([]);
  });
});
