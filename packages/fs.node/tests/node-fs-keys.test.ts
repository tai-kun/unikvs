import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { IStorage } from "@unikvs/core";
import {
  createDeleteContext,
  createGetContext,
  createHasContext,
  createSetContext,
  createStreamContext,
} from "@unikvs/testing";
import { InvalidFilenameError } from "@unikvs/utils";
import { describe } from "vitest";

import { test } from "./_helpers.js";

describe("キー検証", () => {
  test("有効なキーは書き込み・存在確認・読み取り・削除ができる", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const validKeys = [
      "file.txt",
      "archive.tar.gz",
      "my file.bin",
      ".hidden",
      "key-1_2.bin",
      "日本語ファイル.bin",
      "📦.bin",
      "a".repeat(200),
      "あ".repeat(70),
    ];

    for (const [index, key] of validKeys.entries()) {
      // 準備
      const data = new Uint8Array([index, index + 1]);

      // 実行
      await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);

      // 検証
      expect(await storage.exists(createHasContext(key) as IStorage.ExistsContext)).toBe(true);
      expect(
        new Uint8Array(
          await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
        ),
      ).toStrictEqual(data);

      // 実行
      await storage.delete(createDeleteContext(key) as IStorage.DeleteContext);

      // 検証
      expect(await storage.exists(createHasContext(key) as IStorage.ExistsContext)).toBe(false);
    }
  });

  test("無効なキーはすべての操作で InvalidFilenameError になる", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const invalidKeys = [
      "",
      ".",
      "..",
      "../escape",
      "dir/file",
      "..\\escape",
      "/",
      "\\",
      "C:\\Windows",
      "a:b",
      "a?b",
      "a*b",
      "a|b",
      "a<b",
      "a>b",
      'a"b',
      "CON",
      "con.txt",
      "NUL",
      "COM1",
      "LPT1",
      "trailing.",
      "trailing ",
      "null\u0000byte",
      "control\u001fchar",
      "line\nbreak",
      "e\u0301.bin",
      "a".repeat(256),
    ];

    for (const key of invalidKeys) {
      await expect(
        storage.write(
          createSetContext(key, { signal }) as IStorage.WriteContext,
          new Uint8Array([1]),
        ),
      ).rejects.toThrow(InvalidFilenameError);
      await expect(
        storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
      ).rejects.toThrow(InvalidFilenameError);
      await expect(storage.exists(createHasContext(key) as IStorage.ExistsContext)).rejects.toThrow(
        InvalidFilenameError,
      );
      await expect(
        storage.delete(createDeleteContext(key) as IStorage.DeleteContext),
      ).rejects.toThrow(InvalidFilenameError);
      await expect(
        storage.getWritable(createSetContext(key, { signal }) as IStorage.GetWritableContext),
      ).rejects.toThrow(InvalidFilenameError);
      expect(() =>
        storage.getReadable(createStreamContext(key, { signal }) as IStorage.GetReadableContext),
      ).toThrow(InvalidFilenameError);
    }
  });

  test("手動で配置した 255 バイトのファイル名は read・exists・delete できる", async ({
    expect,
    root,
    signal,
    storage,
  }) => {
    // 準備
    const key = "a".repeat(255);
    const data = new Uint8Array([1, 2, 3]);
    await writeFile(join(root, key), data);

    // 実行と検証
    expect(await storage.exists(createHasContext(key) as IStorage.ExistsContext)).toBe(true);
    expect(
      new Uint8Array(await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext)),
    ).toStrictEqual(data);

    // 実行
    await storage.delete(createDeleteContext(key) as IStorage.DeleteContext);

    // 検証
    expect(await storage.exists(createHasContext(key) as IStorage.ExistsContext)).toBe(false);
  });

  test.fails("255 バイトの有効なキーでも write できる", async ({ expect, signal, storage }) => {
    // 準備
    const key = "a".repeat(255);

    // 実行と検証
    await expect(
      storage.write(
        createSetContext(key, { signal }) as IStorage.WriteContext,
        new Uint8Array([1]),
      ),
    ).resolves.toBeUndefined();
  });
});
