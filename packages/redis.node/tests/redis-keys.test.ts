import type { IStorage } from "@unikvs/core";
import {
  createClearContext,
  createCloseContext,
  createDeleteContext,
  createGetContext,
  createHasContext,
  createOpenContext,
  createSetContext,
} from "@unikvs/testing";
import { describe } from "vitest";

import { createStorage, listKeys, test } from "./_helpers.js";

describe("キーの扱い", () => {
  test("Redis が受け付ける任意の文字列キーは書き込み・存在確認・読み取り・削除ができる", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const keys = [
      "",
      " ",
      ".",
      "..",
      "../escape",
      "dir/file",
      "a:b",
      "my file.bin",
      "日本語キー",
      "📦.bin",
      "line\nbreak",
      "null\u0000byte",
      "a".repeat(1024),
    ];

    for (const [index, key] of keys.entries()) {
      // 準備
      const data = new Uint8Array([index, index + 1]);

      // 実行
      await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);

      // 検証
      await expect(
        storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext),
      ).resolves.toBe(true);
      await expect(
        storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
      ).resolves.toStrictEqual(data);

      // 実行
      await storage.delete(createDeleteContext(key, { signal }) as IStorage.DeleteContext);

      // 検証
      await expect(
        storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext),
      ).resolves.toBe(false);
    }
  });

  test("書き込みはプレフィックスを付与したキーに保存される", async ({
    client,
    expect,
    keyPrefix,
    signal,
    storage,
  }) => {
    // 準備
    const key = "prefixed.bin";
    const data = new Uint8Array([1, 2, 3]);

    // 実行
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);

    // 検証
    // `ioredis` の `exists` は数値を返すため、`1` / `0` で比較する。
    await expect(client.exists(`${keyPrefix}${key}`)).resolves.toBe(1);
    const raw = await client.getBuffer(`${keyPrefix}${key}`);
    expect(new Uint8Array(raw!)).toStrictEqual(data);
    await expect(client.exists(key)).resolves.toBe(0);
  });

  test("clear はプレフィックスが一致しないキーを削除しない", async ({
    client,
    expect,
    signal,
    storage,
  }) => {
    // 準備
    await storage.write(
      createSetContext("mine.bin", { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    await client.set("unikvs-other:key", "keep");

    // 実行
    await storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);

    // 検証
    await expect(
      storage.exists(createHasContext("mine.bin", { signal }) as IStorage.ExistsContext),
    ).resolves.toBe(false);
    await expect(client.get("unikvs-other:key")).resolves.toBe("keep");
  });

  test("getWritable の一時キーはプレフィックス配下に作られ close で消える", async ({
    client,
    expect,
    keyPrefix,
    signal,
    storage,
  }) => {
    // 準備
    const key = "stream.bin";
    const writer = storage
      .getWritable(createSetContext(key, { signal }) as IStorage.GetWritableContext)
      .getWriter();

    // 実行
    await writer.write(new Uint8Array([1, 2]));

    // 検証
    const duringWrite = await listKeys(client, `${keyPrefix}*`);
    expect(duringWrite).toHaveLength(1);
    expect(duringWrite[0]!.startsWith(`${keyPrefix}${key}.`)).toBe(true);
    expect(duringWrite[0]!.endsWith(".tmp")).toBe(true);
    await writer.close();
    await expect(listKeys(client, `${keyPrefix}*`)).resolves.toStrictEqual([`${keyPrefix}${key}`]);
  });

  test("clear は書き込み途中で残った一時キーも削除する", async ({ expect, signal, storage }) => {
    // 準備
    await storage.write(
      createSetContext("normal.bin", { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    const writable = storage.getWritable(
      createSetContext("abandoned.bin", { signal }) as IStorage.GetWritableContext,
    );
    await writable.getWriter().write(new Uint8Array([2]));

    // 実行
    await storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);

    // 検証
    await expect(
      storage.exists(createHasContext("normal.bin", { signal }) as IStorage.ExistsContext),
    ).resolves.toBe(false);
    await expect(
      storage.exists(createHasContext("abandoned.bin", { signal }) as IStorage.ExistsContext),
    ).resolves.toBe(false);
  });

  test("プレフィックスが空のとき、キーはそのまま保存され clear は全キーを削除する", async ({
    client,
    expect,
    signal,
    url,
  }) => {
    // 準備
    const raw = createStorage(url, "");
    await raw.open(createOpenContext() as IStorage.OpenContext);
    await client.set("unrelated-key", "value");

    try {
      // 実行
      await raw.write(
        createSetContext("raw-key", { signal }) as IStorage.WriteContext,
        new Uint8Array([1]),
      );

      // 検証
      // `ioredis` の `exists` は数値を返すため、`1` / `0` で比較する。
      await expect(client.exists("raw-key")).resolves.toBe(1);

      // 実行
      await raw.clear(createClearContext("", { signal }) as IStorage.ClearContext);

      // 検証
      await expect(client.exists("raw-key")).resolves.toBe(0);
      await expect(client.exists("unrelated-key")).resolves.toBe(0);
    } finally {
      await raw.close(createCloseContext() as IStorage.CloseContext);
    }
  });
});
