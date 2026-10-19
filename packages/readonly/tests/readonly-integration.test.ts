import { KeyNotFoundError, type IStorage } from "@unikvs/core";
import { Memory } from "@unikvs/memory";
import {
  captureRejection,
  createGetContext,
  createHasContext,
  createSetContext,
} from "@unikvs/testing";
import { PluginOperationAggregateError, UniKvs, type Value } from "unikvs";
import { describe, test } from "vitest";

import {
  ReadOnlyClearNotAllowedError,
  ReadOnlyDeleteNotAllowedError,
  ReadOnlySetNotAllowedError,
} from "../src/errors.js";
import ReadOnly from "../src/readonly.js";

/**
 * 統合テストで使うキーと値の対応です。
 * 読み出し専用パイプラインの検証に使用します。
 */
type TestMapping = {
  report: Value<string>;
  archived: Value<string>;
};

/**
 * ReadOnly を適用したクライアントを作成します。
 * 書き込みの拒否と読み出しの透過の検証に使用します。
 * シードデータはミドルウェアーを介さず下流ストレージへ直接書き込みます。
 */
async function createReadOnlyKvs(
  seed: Record<string, string> = { report: "hello" },
  allowDelete = false,
) {
  const storage = new Memory();

  for (const [key, value] of Object.entries(seed)) {
    storage.write(createSetContext(key) as IStorage.WriteContext, value);
  }

  const kvs = UniKvs.config<TestMapping>()
    .use(new ReadOnly({ allowDelete }))
    .persist(storage)
    .create();
  await kvs.open();

  return { kvs, storage };
}

describe("読み出しと存在確認", () => {
  test("get を呼び出したとき、下流ストレージから値が返る", async ({ expect }) => {
    // 準備
    const { kvs } = await createReadOnlyKvs();

    // 実行
    const value = await kvs.get("report");

    // 検証
    expect(value).toBe("hello");

    // 後片付け
    await kvs.close();
  });

  test("has を呼び出したとき、下流ストレージの存在確認結果が返る", async ({ expect }) => {
    // 準備
    const { kvs } = await createReadOnlyKvs();

    // 実行と検証
    expect(await kvs.has("report")).toBe(true);
    expect(await kvs.has("archived")).toBe(false);

    // 後片付け
    await kvs.close();
  });

  test("未登録のキーを get したとき、下流の KeyNotFoundError で失敗する", async ({ expect }) => {
    // 準備
    const { kvs } = await createReadOnlyKvs({});

    // 実行
    const error = await captureRejection(kvs.get("report"));

    // 検証
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect(error).toMatchObject({
      name: "UniKvsKeyNotFoundError",
      message: "Key not found: report",
      meta: { key: "report" },
    });

    // 後片付け
    await kvs.close();
  });
});

describe("書き込みの拒否", () => {
  test("set を呼び出したとき、集約エラーで失敗しデータが保存されない", async ({ expect }) => {
    // 準備
    const { kvs, storage } = await createReadOnlyKvs({});

    // 実行
    const error = await captureRejection(kvs.set("report", "hello"));

    // 検証
    expect(error).toBeInstanceOf(PluginOperationAggregateError);
    expect((error as PluginOperationAggregateError).meta.action).toBe("write");
    expect((error as PluginOperationAggregateError).meta.errors).toHaveLength(1);
    const reason = (error as PluginOperationAggregateError).meta.errors[0]?.reason;
    expect(reason).toBeInstanceOf(ReadOnlySetNotAllowedError);
    expect((reason as ReadOnlySetNotAllowedError).meta).toStrictEqual({ key: "report" });
    expect(storage.exists(createHasContext("report") as IStorage.ExistsContext)).toBe(false);

    // 後片付け
    await kvs.close();
  });

  test("既存データへの set も集約エラーで失敗しデータが上書きされない", async ({ expect }) => {
    // 準備
    const { kvs, storage } = await createReadOnlyKvs();

    // 実行
    const error = await captureRejection(kvs.set("report", "updated"));

    // 検証
    expect(error).toBeInstanceOf(PluginOperationAggregateError);
    expect((error as PluginOperationAggregateError).meta.action).toBe("write");
    expect(storage.read(createGetContext("report") as IStorage.ReadContext)).toBe("hello");

    // 後片付け
    await kvs.close();
  });
});

describe("削除の拒否", () => {
  test("delete が集約エラーで失敗しデータが残る", async ({ expect }) => {
    // 準備
    const { kvs, storage } = await createReadOnlyKvs();

    // 実行
    const error = await captureRejection(kvs.delete("report"));

    // 検証
    expect(error).toBeInstanceOf(PluginOperationAggregateError);
    expect((error as PluginOperationAggregateError).meta.action).toBe("delete");
    expect((error as PluginOperationAggregateError).meta.errors).toHaveLength(1);
    const reason = (error as PluginOperationAggregateError).meta.errors[0]?.reason;
    expect(reason).toBeInstanceOf(ReadOnlyDeleteNotAllowedError);
    expect((reason as ReadOnlyDeleteNotAllowedError).meta).toStrictEqual({ key: "report" });
    expect(storage.exists(createHasContext("report") as IStorage.ExistsContext)).toBe(true);

    // 後片付け
    await kvs.close();
  });

  test("clear が集約エラーで失敗しデータが残る", async ({ expect }) => {
    // 準備
    const { kvs, storage } = await createReadOnlyKvs();

    // 実行
    const error = await captureRejection(kvs.clear());

    // 検証
    expect(error).toBeInstanceOf(PluginOperationAggregateError);
    expect((error as PluginOperationAggregateError).meta.action).toBe("clear");
    expect((error as PluginOperationAggregateError).meta.errors).toHaveLength(1);
    expect((error as PluginOperationAggregateError).meta.errors[0]?.reason).toBeInstanceOf(
      ReadOnlyClearNotAllowedError,
    );
    expect(storage.exists(createHasContext("report") as IStorage.ExistsContext)).toBe(true);

    // 後片付け
    await kvs.close();
  });
});

describe("削除の許可", () => {
  test("allowDelete が true のとき、delete で下流ストレージから削除される", async ({ expect }) => {
    // 準備
    const { kvs, storage } = await createReadOnlyKvs({ report: "hello" }, true);

    // 実行
    await kvs.delete("report");

    // 検証
    expect(storage.exists(createHasContext("report") as IStorage.ExistsContext)).toBe(false);

    // 後片付け
    await kvs.close();
  });

  test("allowDelete が true のとき、clear で下流ストレージが空になる", async ({ expect }) => {
    // 準備
    const { kvs, storage } = await createReadOnlyKvs({ report: "hello" }, true);

    // 実行
    await kvs.clear();

    // 検証
    expect(storage.exists(createHasContext("report") as IStorage.ExistsContext)).toBe(false);

    // 後片付け
    await kvs.close();
  });

  test("allowDelete が true でも set は拒否される", async ({ expect }) => {
    // 準備
    const { kvs } = await createReadOnlyKvs({}, true);

    // 実行
    const error = await captureRejection(kvs.set("report", "hello"));

    // 検証
    expect(error).toBeInstanceOf(PluginOperationAggregateError);
    const reason = (error as PluginOperationAggregateError).meta.errors[0]?.reason;
    expect(reason).toBeInstanceOf(ReadOnlySetNotAllowedError);

    // 後片付け
    await kvs.close();
  });
});
