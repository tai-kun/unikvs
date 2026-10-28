import type { IMiddleware } from "@unikvs/core";
import { test, describe } from "vite-plus/test";

import { KeyNotFoundError, PluginOperationAggregateError } from "../src/errors.js";
import { Builder } from "../src/index.js";
import type { PlainValue } from "../src/value-schemas.js";
import { FakeStorage } from "./_helpers.js";

type Mapping = Record<string, PlainValue<string>>;

/**
 * キーの先頭に固定の接頭辞を付けるミドルウェアです。
 * コピー元とコピー先の両方へキー写像が適用されることを検証します。
 */
class PrefixMiddleware implements IMiddleware {
  public readonly name = "PrefixMiddleware";

  public readonly isOpen = true;

  public mapKey(c: IMiddleware.MapKeyContext): string {
    return `prefix:${c.key}`;
  }
}

/**
 * 指定したストレージへ接続した KVS を作成して開きます。
 */
async function createKvs(storages: readonly FakeStorage[]): Promise<{
  kvs: ReturnType<Builder<Mapping>["build"]>;
  first: FakeStorage;
  second: FakeStorage | undefined;
}> {
  const [first, second] = storages;

  if (first === undefined) {
    throw new Error("ストレージが必要です。");
  }

  let builder = new Builder<Mapping>().persist(first);

  if (second !== undefined) {
    builder = builder.persist(second);
  }

  const kvs = builder.build();
  await kvs.open();

  return {
    kvs,
    first,
    second,
  };
}

describe("UniKvs - コピー", () => {
  test("コピー元を残したままコピー先へ値を複製する", async ({ expect }) => {
    // 準備：
    const storage = new FakeStorage();
    const { kvs } = await createKvs([storage]);
    await kvs.set("source", "value");

    // 実行：
    await kvs.copy("source", "destination");

    // 検証：
    await expect(kvs.get("destination")).resolves.toBe("value");
    await expect(kvs.get("source")).resolves.toBe("value");
    expect(storage.callsOf("copy")[0]).toMatchObject({
      key: "source",
      action: "copy",
      destinationKey: "destination",
    });
  });

  test("オプションオブジェクト形式でもコピーできる", async ({ expect }) => {
    // 準備：
    const storage = new FakeStorage();
    const { kvs } = await createKvs([storage]);
    await kvs.set("source", "value");

    // 実行：
    await kvs.copy({
      key: "source",
      vars: {
        via: "copy",
      },
      destinationKey: "destination",
    });

    // 検証：
    await expect(kvs.get("destination")).resolves.toBe("value");
    expect(storage.callsOf("copy")[0]?.vars?.get("via")).toBe("copy");
  });

  test("コピー先に既存の値があるとき上書きする", async ({ expect }) => {
    // 準備：
    const storage = new FakeStorage();
    const { kvs } = await createKvs([storage]);
    await kvs.set("source", "new");
    await kvs.set("destination", "old");

    // 実行：
    await kvs.copy("source", "destination");

    // 検証：
    await expect(kvs.get("destination")).resolves.toBe("new");
  });

  test("コピー元が存在しないとき KeyNotFoundError を投げる", async ({ expect }) => {
    // 準備：
    const storage = new FakeStorage();
    const { kvs } = await createKvs([storage]);

    // 実行と検証：
    await expect(kvs.copy("missing", "destination")).rejects.toMatchObject({
      meta: {
        key: "missing",
      },
    });
    await expect(kvs.copy("missing", "destination")).rejects.toThrow(KeyNotFoundError);
    expect(storage.map.has("destination")).toBe(false);
  });

  test("同じキーへのコピーは存在確認だけで値を変更しない", async ({ expect }) => {
    // 準備：
    const storage = new FakeStorage();
    const { kvs } = await createKvs([storage]);
    await kvs.set("key", "value");

    // 実行：
    await kvs.copy("key", "key");

    // 検証：
    await expect(kvs.get("key")).resolves.toBe("value");
  });

  test("同じキーへのコピーでも存在しなければ KeyNotFoundError を投げる", async ({ expect }) => {
    // 準備：
    const storage = new FakeStorage();
    const { kvs } = await createKvs([storage]);

    // 実行と検証：
    await expect(kvs.copy("missing", "missing")).rejects.toThrow(KeyNotFoundError);
  });

  test("中断済みシグナルではコピーしない", async ({ expect }) => {
    // 準備：
    const storage = new FakeStorage();
    const { kvs } = await createKvs([storage]);
    await kvs.set("source", "value");

    const ac = new AbortController();
    ac.abort(new Error("aborted"));

    // 実行と検証：
    await expect(
      kvs.copy("source", "destination", {
        signal: ac.signal,
      }),
    ).rejects.toThrow("aborted");

    expect(storage.map.has("destination")).toBe(false);
  });

  test("複数ストレージへすべてコピーする", async ({ expect }) => {
    // 準備：
    const first = new FakeStorage("first");
    const second = new FakeStorage("second");
    const { kvs } = await createKvs([first, second]);
    await kvs.set("source", "value");

    // 実行：
    await kvs.copy("source", "destination");

    // 検証：
    expect(first.map.get("destination")).toBe("value");
    expect(second.map.get("destination")).toBe("value");
  });

  test("コピー先の書き込みに失敗したストレージを集約エラーで報告する", async ({ expect }) => {
    // 準備：
    const first = new FakeStorage("first");
    const second = new FakeStorage("second");
    const { kvs } = await createKvs([first, second]);
    await kvs.set("source", "value");

    const failure = new Error("copy failed");
    second.errors.copy = failure;

    // 実行：
    const promise = kvs.copy("source", "destination");

    // 検証：
    await expect(promise).rejects.toThrow(PluginOperationAggregateError);
    await expect(promise).rejects.toMatchObject({
      meta: {
        action: "copy",
      },
    });

    expect(first.map.get("destination")).toBe("value");
    expect(second.map.has("destination")).toBe(false);
  });

  test("ミドルウェアのキー写像をコピー元とコピー先の両方へ適用する", async ({ expect }) => {
    // 準備：
    const storage = new FakeStorage();
    const kvs = new Builder<Mapping>().use(new PrefixMiddleware()).persist(storage).build();
    await kvs.open();
    await kvs.set("source", "value");

    // 実行：
    await kvs.copy("source", "destination");

    // 検証：
    expect(storage.map.get("prefix:source")).toBe("value");
    expect(storage.map.get("prefix:destination")).toBe("value");
    await expect(kvs.get("destination")).resolves.toBe("value");
  });
});

describe("UniKvs - 移動", () => {
  test("移動先へ値を書き込んでから移動元を削除する", async ({ expect }) => {
    // 準備：
    const storage = new FakeStorage();
    const { kvs } = await createKvs([storage]);
    await kvs.set("source", "value");

    // 実行：
    await kvs.move("source", "destination");

    // 検証：
    await expect(kvs.get("destination")).resolves.toBe("value");
    await expect(kvs.get("source")).rejects.toThrow(KeyNotFoundError);
    expect(storage.callsOf("move")[0]).toMatchObject({
      key: "source",
      action: "move",
      destinationKey: "destination",
    });
  });

  test("オプションオブジェクト形式でも移動できる", async ({ expect }) => {
    // 準備：
    const storage = new FakeStorage();
    const { kvs } = await createKvs([storage]);
    await kvs.set("source", "value");

    // 実行：
    await kvs.move({
      key: "source",
      destinationKey: "destination",
    });

    // 検証：
    await expect(kvs.get("destination")).resolves.toBe("value");
    await expect(kvs.get("source")).rejects.toThrow(KeyNotFoundError);
  });

  test("移動先に既存の値があるとき上書きする", async ({ expect }) => {
    // 準備：
    const storage = new FakeStorage();
    const { kvs } = await createKvs([storage]);
    await kvs.set("source", "new");
    await kvs.set("destination", "old");

    // 実行：
    await kvs.move("source", "destination");

    // 検証：
    await expect(kvs.get("destination")).resolves.toBe("new");
  });

  test("移動元が存在しないとき KeyNotFoundError を投げる", async ({ expect }) => {
    // 準備：
    const storage = new FakeStorage();
    const { kvs } = await createKvs([storage]);

    // 実行と検証：
    await expect(kvs.move("missing", "destination")).rejects.toThrow(KeyNotFoundError);
  });

  test("同じキーへの移動は削除しない", async ({ expect }) => {
    // 準備：
    const storage = new FakeStorage();
    const { kvs } = await createKvs([storage]);
    await kvs.set("key", "value");

    // 実行：
    await kvs.move("key", "key");

    // 検証：
    await expect(kvs.get("key")).resolves.toBe("value");
  });

  test("複数ストレージからすべて移動する", async ({ expect }) => {
    // 準備：
    const first = new FakeStorage("first");
    const second = new FakeStorage("second");
    const { kvs } = await createKvs([first, second]);
    await kvs.set("source", "value");

    // 実行：
    await kvs.move("source", "destination");

    // 検証：
    expect(first.map.has("source")).toBe(false);
    expect(second.map.has("source")).toBe(false);
    expect(first.map.get("destination")).toBe("value");
    expect(second.map.get("destination")).toBe("value");
  });
});
