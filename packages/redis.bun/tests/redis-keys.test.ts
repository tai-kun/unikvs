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
      await storage.write({ key, data, signal });

      // 検証
      await expect(storage.exists({ key, signal })).resolves.toBe(true);
      await expect(storage.read({ key, signal })).resolves.toStrictEqual(data);

      // 実行
      await storage.delete({ key, signal });

      // 検証
      await expect(storage.exists({ key, signal })).resolves.toBe(false);
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
    await storage.write({ key, data, signal });

    // 検証
    await expect(client.exists(`${keyPrefix}${key}`)).resolves.toBe(true);
    const raw = await client.getBuffer(`${keyPrefix}${key}`);
    expect(new Uint8Array(raw!)).toStrictEqual(data);
    await expect(client.exists(key)).resolves.toBe(false);
  });

  test("clear はプレフィックスが一致しないキーを削除しない", async ({
    client,
    expect,
    signal,
    storage,
  }) => {
    // 準備
    await storage.write({ key: "mine.bin", data: new Uint8Array([1]), signal });
    await client.set("unikvs-other:key", "keep");

    // 実行
    await storage.clear({ signal });

    // 検証
    await expect(storage.exists({ key: "mine.bin", signal })).resolves.toBe(false);
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
    const writer = storage.getWritable({ key, signal }).getWriter();

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
    await storage.write({ key: "normal.bin", data: new Uint8Array([1]), signal });
    const writable = storage.getWritable({ key: "abandoned.bin", signal });
    await writable.getWriter().write(new Uint8Array([2]));

    // 実行
    await storage.clear({ signal });

    // 検証
    await expect(storage.exists({ key: "normal.bin", signal })).resolves.toBe(false);
    await expect(storage.exists({ key: "abandoned.bin", signal })).resolves.toBe(false);
  });

  test("プレフィックスが空のとき、キーはそのまま保存され clear は全キーを削除する", async ({
    client,
    expect,
    signal,
    url,
  }) => {
    // 準備
    const raw = createStorage(url, "");
    await raw.open();
    await client.set("unrelated-key", "value");

    try {
      // 実行
      await raw.write({ key: "raw-key", data: new Uint8Array([1]), signal });

      // 検証
      await expect(client.exists("raw-key")).resolves.toBe(true);

      // 実行
      await raw.clear({ signal });

      // 検証
      await expect(client.exists("raw-key")).resolves.toBe(false);
      await expect(client.exists("unrelated-key")).resolves.toBe(false);
    } finally {
      raw.close();
    }
  });
});
