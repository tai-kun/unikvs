import { chmod, mkdir, access, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { IStorage } from "@unikvs/core";
import {
  createGetContext,
  createHasContext,
  createSetContext,
  createClearContext,
  createDeleteContext,
} from "@unikvs/testing";
import { listTemporaryFiles } from "@unikvs/testing/node";
import { describe } from "vite-plus/test";

import { test } from "./_helpers.js";

const isPermissionTestSupported = process.platform !== "win32" && process.getuid?.() !== 0;
describe("権限エラー", () => {
  test.skipIf(!isPermissionTestSupported)(
    "書き込み権限のないルートでは write が EACCES で失敗する",
    async ({ root, expect, signal, storage }) => {
      // 準備：
      await chmod(root, 0o500);

      try {
        // 実行と検証：
        await expect(
          storage.write(
            createSetContext("denied.bin", { signal }) as IStorage.WriteContext,
            new Uint8Array([1]),
          ),
        ).rejects.toThrow(/EACCES/u);
        expect(await listTemporaryFiles(root)).toStrictEqual([]);
      } finally {
        await chmod(root, 0o700);
      }
    },
  );

  test.skipIf(!isPermissionTestSupported)(
    "読み取り権限のないファイルの read は EACCES で失敗する",
    async ({ root, expect, signal, storage }) => {
      // 準備：
      const key = "no-read.bin";
      await storage.write(
        createSetContext(key, { signal }) as IStorage.WriteContext,
        new Uint8Array([1]),
      );
      await chmod(join(root, key), 0o000);

      try {
        // 実行と検証：
        await expect(
          storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
        ).rejects.toThrow(/EACCES/u);
      } finally {
        await chmod(join(root, key), 0o600);
      }
    },
  );

  test.skipIf(!isPermissionTestSupported)(
    "読み取り権限のないルートでは exists が EACCES で失敗する",
    async ({ root, expect, signal, storage }) => {
      // 準備：
      const key = "no-access.bin";
      await storage.write(
        createSetContext(key, { signal }) as IStorage.WriteContext,
        new Uint8Array([1]),
      );

      await chmod(root, 0o000);

      try {
        // 実行と検証：
        await expect(
          storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext),
        ).rejects.toThrow(/EACCES/u);
      } finally {
        await chmod(root, 0o700);
      }
    },
  );
});

describe("abort された signal", () => {
  test("read は失敗する", async ({ expect, signal, storage }) => {
    // 準備：
    const key = "aborted-read.bin";
    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

    const controller = new AbortController();
    controller.abort();

    // 実行と検証：
    await expect(
      storage.read(createGetContext(key, { signal: controller.signal }) as IStorage.ReadContext),
    ).rejects.toThrow();
  });

  test("exists は中断理由で失敗する", async ({ expect, signal, storage }) => {
    // 準備：
    const key = "aborted-exists.bin";
    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

    const controller = new AbortController();
    const reason = new Error("exists の中断");
    controller.abort(reason);

    // 実行と検証：
    await expect(
      storage.exists(
        createHasContext(key, { signal: controller.signal }) as IStorage.ExistsContext,
      ),
    ).rejects.toBe(reason);
  });

  test("delete は中断理由で失敗し、データが残る", async ({ expect, signal, storage }) => {
    // 準備：
    const key = "aborted-delete.bin";
    const data = new Uint8Array([1, 2, 3]);
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);

    const controller = new AbortController();
    const reason = new Error("delete の中断");
    controller.abort(reason);

    // 実行と検証：
    await expect(
      storage.delete(
        createDeleteContext(key, { signal: controller.signal }) as IStorage.DeleteContext,
      ),
    ).rejects.toBe(reason);

    expect(
      new Uint8Array(await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext)),
    ).toStrictEqual(data);
  });

  test("clear は中断理由で失敗し、データが残る", async ({ expect, signal, storage }) => {
    // 準備：
    const key = "aborted-clear.bin";
    const data = new Uint8Array([4, 5, 6]);
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);

    const controller = new AbortController();
    const reason = new Error("clear の中断");
    controller.abort(reason);

    // 実行と検証：
    await expect(
      storage.clear(createClearContext("", { signal: controller.signal }) as IStorage.ClearContext),
    ).rejects.toBe(reason);

    expect(
      new Uint8Array(await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext)),
    ).toStrictEqual(data);
  });
});

describe("clear 中の中断", () => {
  test("削除中に中断したとき、中断理由で失敗しルートを作り直さない", async ({
    root,
    expect,
    signal,
    storage,
  }) => {
    // 準備：
    await storage.write(
      createSetContext("clear-midway.bin", { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    const controller = new AbortController();
    const reason = new Error("clear 実行中の中断");

    // 実行：
    const clearing = storage.clear(
      createClearContext("", { signal: controller.signal }) as IStorage.ClearContext,
    );
    controller.abort(reason);

    // 検証：
    await expect(clearing).rejects.toBe(reason);

    // 削除は完了していますが、中断後の再作成は行われません。
    await expect(access(root)).rejects.toMatchObject({ code: "ENOENT" });
  });
});

describe("rename 失敗時の保全", () => {
  test("ストリーム書き込みの close で rename が失敗したとき、既存ディレクトリーと中身が保たれる", async ({
    root,
    expect,
    signal,
    storage,
  }) => {
    // 準備：
    const key = "conflict.bin";
    const innerData = new Uint8Array([7, 7]);
    await mkdir(join(root, key));
    await writeFile(join(root, key, "inner.txt"), innerData);

    const writer = storage
      .getWritable(createSetContext(key, { signal }) as IStorage.GetWritableContext)
      .getWriter();
    await writer.write(new Uint8Array([1, 2, 3]));

    // 実行と検証：
    await expect(writer.close()).rejects.toThrow();

    expect(await readdir(join(root, key))).toStrictEqual(["inner.txt"]);
    expect(new Uint8Array(await readFile(join(root, key, "inner.txt")))).toStrictEqual(innerData);
    expect(await listTemporaryFiles(root)).toStrictEqual([]);
  });

  test("通常 write で rename が失敗したとき、既存ディレクトリーと中身が保たれる", async ({
    root,
    expect,
    signal,
    storage,
  }) => {
    // 準備：
    const key = "conflict2.bin";
    const innerData = new Uint8Array([7]);
    await mkdir(join(root, key));
    await writeFile(join(root, key, "inner.txt"), innerData);

    // 実行と検証：
    await expect(
      storage.write(
        createSetContext(key, { signal }) as IStorage.WriteContext,
        new Uint8Array([1]),
      ),
    ).rejects.toThrow();
    expect(await readdir(join(root, key))).toStrictEqual(["inner.txt"]);
    expect(new Uint8Array(await readFile(join(root, key, "inner.txt")))).toStrictEqual(innerData);

    expect(await listTemporaryFiles(root)).toStrictEqual([]);
  });
});
