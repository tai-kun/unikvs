import type { IStorage } from "@unikvs/core";
import {
  createGetContext,
  createHasContext,
  createSetContext,
  createOpenContext,
  createClearContext,
  createCloseContext,
  createDeleteContext,
} from "@unikvs/testing";
import { describe } from "vite-plus/test";

import { test, listKeys, createStorage } from "./_helpers.js";

describe("キーの扱い", () => {
  test("Redis が受け付ける任意の文字列キーは書き込み・存在確認・読み取り・削除ができる", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備：
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
      // 準備：
      const data = new Uint8Array([index, index + 1]);

      // 実行：
      await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);

      // 検証：
      await expect(
        storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext),
      ).resolves.toBe(true);
      await expect(
        storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
      ).resolves.toStrictEqual(data);

      // 実行：
      await storage.delete(createDeleteContext(key, { signal }) as IStorage.DeleteContext);

      // 検証：
      await expect(
        storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext),
      ).resolves.toBe(false);
    }
  });

  test("書き込みはプレフィックスを付与したキーに保存される", async ({
    client,
    expect,
    signal,
    storage,
    keyPrefix,
  }) => {
    // 準備：
    const key = "prefixed.bin";
    const data = new Uint8Array([1, 2, 3]);

    // 実行：
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);

    // 検証：
    await expect(client.exists(`${keyPrefix}${key}`)).resolves.toBe(true);

    const raw = await client.getBuffer(`${keyPrefix}${key}`);
    expect(raw).not.toBeNull();
    expect(new Uint8Array(raw as Buffer)).toStrictEqual(data);

    await expect(client.exists(key)).resolves.toBe(false);
  });

  test("clear はプレフィックスが一致しないキーを削除しない", async ({
    client,
    expect,
    signal,
    storage,
  }) => {
    // 準備：
    await storage.write(
      createSetContext("mine.bin", { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    await client.set("unikvs-other:key", "keep");

    // 実行：
    await storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);

    // 検証：
    await expect(
      storage.exists(createHasContext("mine.bin", { signal }) as IStorage.ExistsContext),
    ).resolves.toBe(false);
    await expect(client.get("unikvs-other:key")).resolves.toBe("keep");
  });

  test("clear はグロブのメタ文字を含むプレフィックスをリテラルとして扱う", async ({
    url,
    client,
    expect,
    signal,
  }) => {
    // 準備：
    const id = crypto.randomUUID();
    const cases = [
      {
        prefix: `[tenant]:${id}:`,
        collision: `t:${id}:keep`,
      },
      {
        prefix: `app*${id}:`,
        collision: `application${id}:keep`,
      },
      {
        prefix: `a?b${id}:`,
        collision: `axb${id}:keep`,
      },
      {
        prefix: `back\\slash${id}:`,
        collision: `backslash${id}:keep`,
      },
    ];

    for (const { prefix, collision } of cases) {
      const storage = createStorage(url, prefix);
      await storage.open(createOpenContext() as IStorage.OpenContext);

      try {
        // 準備：
        await storage.write(
          createSetContext("own.bin", { signal }) as IStorage.WriteContext,
          new Uint8Array([1]),
        );
        await client.set(collision, "keep");

        // 実行：
        await storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);

        // 検証：
        await expect(
          storage.exists(createHasContext("own.bin", { signal }) as IStorage.ExistsContext),
        ).resolves.toBe(false);
        await expect(client.get(collision)).resolves.toBe("keep");

        await client.del(collision);
      } finally {
        storage.close(createCloseContext() as IStorage.CloseContext);
      }
    }
  });

  test("getWritable の一時キーはプレフィックス配下に作られ close で消える", async ({
    client,
    expect,
    signal,
    storage,
    keyPrefix,
  }) => {
    // 準備：
    const key = "stream.bin";
    const writer = storage
      .getWritable(createSetContext(key, { signal }) as IStorage.GetWritableContext)
      .getWriter();

    // 実行：
    await writer.write(new Uint8Array([1, 2]));

    // 検証：
    const duringWrite = await listKeys(client, `${keyPrefix}*`);
    expect(duringWrite).toHaveLength(1);
    expect(duringWrite.at(0)?.startsWith(`${keyPrefix}${key}.`)).toBe(true);
    expect(duringWrite.at(0)?.endsWith(".tmp")).toBe(true);

    await writer.close();
    await expect(listKeys(client, `${keyPrefix}*`)).resolves.toStrictEqual([`${keyPrefix}${key}`]);
  });

  test("clear は書き込み途中で残った一時キーも削除する", async ({ expect, signal, storage }) => {
    // 準備：
    await storage.write(
      createSetContext("normal.bin", { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    const writable = storage.getWritable(
      createSetContext("abandoned.bin", { signal }) as IStorage.GetWritableContext,
    );
    await writable.getWriter().write(new Uint8Array([2]));

    // 実行：
    await storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);

    // 検証：
    await expect(
      storage.exists(createHasContext("normal.bin", { signal }) as IStorage.ExistsContext),
    ).resolves.toBe(false);
    await expect(
      storage.exists(createHasContext("abandoned.bin", { signal }) as IStorage.ExistsContext),
    ).resolves.toBe(false);
  });

  test("プレフィックスが空のとき、キーはそのまま保存され clear は全キーを削除する", async ({
    url,
    client,
    expect,
    signal,
  }) => {
    // 準備：
    const raw = createStorage(url, "");
    await raw.open(createOpenContext() as IStorage.OpenContext);

    await client.set("unrelated-key", "value");

    try {
      // 実行：
      await raw.write(
        createSetContext("raw-key", { signal }) as IStorage.WriteContext,
        new Uint8Array([1]),
      );

      // 検証：
      await expect(client.exists("raw-key")).resolves.toBe(true);

      // 実行：
      await raw.clear(createClearContext("", { signal }) as IStorage.ClearContext);

      // 検証：
      await expect(client.exists("raw-key")).resolves.toBe(false);
      await expect(client.exists("unrelated-key")).resolves.toBe(false);
    } finally {
      raw.close(createCloseContext() as IStorage.CloseContext);
    }
  });
});
