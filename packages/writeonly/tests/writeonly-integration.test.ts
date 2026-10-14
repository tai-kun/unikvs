import { Memory } from "@unikvs/memory";
import { captureRejection } from "@unikvs/testing";
import { PluginOperationAggregateError, UniKvs, type Value } from "unikvs";
import { describe, test } from "vitest";

import {
  KeyNotFoundError,
  WriteOnlyClearNotAllowedError,
  WriteOnlyDeleteNotAllowedError,
} from "../src/errors.js";
import WriteOnly, { type WriteOnlyOptions } from "../src/write-only.js";

/**
 * 統合テストで使うキーと値の対応です。
 * 書き込み専用パイプラインの検証に使用します。
 */
type TestMapping = {
  report: Value<string>;
};

/**
 * WriteOnly を適用したクライアントを作成します。
 * 書き込みの透過と読み出し・削除の拒否の検証に使用します。
 */
async function createWriteOnlyKvs(options?: WriteOnlyOptions) {
  const storage = new Memory();
  const kvs = UniKvs.config<TestMapping>()
    .connect(new WriteOnly(options))
    .persist(storage)
    .create();
  await kvs.open();

  return { kvs, storage };
}

describe("書き込みと読み出し", () => {
  test("set を呼び出したとき、下流ストレージに保存される", async ({ expect }) => {
    // 準備
    const { kvs, storage } = await createWriteOnlyKvs();

    // 実行
    await kvs.set("report", "hello");

    // 検証
    expect(storage.exists({ key: "report" })).toBe(true);
    expect(storage.read({ key: "report" })).toBe("hello");

    // 後片付け
    await kvs.close();
  });

  test("get を呼び出したとき、KeyNotFoundError を投げる", async ({ expect }) => {
    // 準備
    const { kvs } = await createWriteOnlyKvs();
    await kvs.set("report", "hello");

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

  test("stream を呼び出したとき、KeyNotFoundError を投げる", async ({ expect }) => {
    // 準備
    const { kvs } = await createWriteOnlyKvs();
    await kvs.set("report", "hello");

    // 実行
    const error = await captureRejection(kvs.stream("report"));

    // 検証
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect((error as KeyNotFoundError).meta).toStrictEqual({ key: "report" });

    // 後片付け
    await kvs.close();
  });
});

describe("存在確認の拒否", () => {
  test("has を呼び出したとき、集約エラーで失敗する", async ({ expect }) => {
    // 準備
    const { kvs } = await createWriteOnlyKvs();
    await kvs.set("report", "hello");

    // 実行
    const error = await captureRejection(kvs.has("report"));

    // 検証
    expect(error).toBeInstanceOf(PluginOperationAggregateError);
    expect((error as PluginOperationAggregateError).meta.action).toBe("read");
    expect((error as PluginOperationAggregateError).meta.errors).toHaveLength(1);
    expect((error as PluginOperationAggregateError).meta.errors[0]?.reason).toBeInstanceOf(
      KeyNotFoundError,
    );

    // 後片付け
    await kvs.close();
  });
});

describe("削除の拒否", () => {
  test("既定では delete が集約エラーで失敗しデータが残る", async ({ expect }) => {
    // 準備
    const { kvs, storage } = await createWriteOnlyKvs();
    await kvs.set("report", "hello");

    // 実行
    const error = await captureRejection(kvs.delete("report"));

    // 検証
    expect(error).toBeInstanceOf(PluginOperationAggregateError);
    expect((error as PluginOperationAggregateError).meta.action).toBe("delete");
    expect((error as PluginOperationAggregateError).meta.errors).toHaveLength(1);
    const reason = (error as PluginOperationAggregateError).meta.errors[0]?.reason;
    expect(reason).toBeInstanceOf(WriteOnlyDeleteNotAllowedError);
    expect((reason as WriteOnlyDeleteNotAllowedError).meta).toStrictEqual({ key: "report" });
    expect(storage.exists({ key: "report" })).toBe(true);

    // 後片付け
    await kvs.close();
  });

  test("既定では clear が集約エラーで失敗しデータが残る", async ({ expect }) => {
    // 準備
    const { kvs, storage } = await createWriteOnlyKvs();
    await kvs.set("report", "hello");

    // 実行
    const error = await captureRejection(kvs.clear());

    // 検証
    expect(error).toBeInstanceOf(PluginOperationAggregateError);
    expect((error as PluginOperationAggregateError).meta.action).toBe("clear");
    expect((error as PluginOperationAggregateError).meta.errors).toHaveLength(1);
    expect((error as PluginOperationAggregateError).meta.errors[0]?.reason).toBeInstanceOf(
      WriteOnlyClearNotAllowedError,
    );
    expect(storage.exists({ key: "report" })).toBe(true);

    // 後片付け
    await kvs.close();
  });

  test("allowDelete が true のとき、delete が透過してデータが削除される", async ({ expect }) => {
    // 準備
    const { kvs, storage } = await createWriteOnlyKvs({ allowDelete: true });
    await kvs.set("report", "hello");

    // 実行
    await kvs.delete("report");

    // 検証
    expect(storage.exists({ key: "report" })).toBe(false);

    // 後片付け
    await kvs.close();
  });

  test("allowDelete が true のとき、clear が透過してデータが削除される", async ({ expect }) => {
    // 準備
    const { kvs, storage } = await createWriteOnlyKvs({ allowDelete: true });
    await kvs.set("report", "hello");

    // 実行
    await kvs.clear();

    // 検証
    expect(storage.exists({ key: "report" })).toBe(false);

    // 後片付け
    await kvs.close();
  });
});
