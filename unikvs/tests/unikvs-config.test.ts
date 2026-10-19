import type { IMiddleware } from "@unikvs/core";
import { describe, test } from "vitest";

import { MissingStorageError } from "../src/errors.js";
import UniKvsConfig from "../src/unikvs-config.js";
import UniKvs from "../src/unikvs.js";
import { FakeStorage } from "./_helpers.js";

/**
 * encode 時に "e:" 接頭辞を付与し、decode 時に除去するミドルウェアモックです。
 */
class MockMiddleware implements IMiddleware {
  readonly name = "MockMiddleware";
  readonly isOpen = true;

  async encode(c: IMiddleware.EncodeContext, next: IMiddleware.INext): Promise<void> {
    c.destination = `e:${String(c.source)}`;
    await next();
  }

  async decode(c: IMiddleware.DecodeContext, next: IMiddleware.INext): Promise<void> {
    c.destination = String(c.source).replace(/^e:/, "");
    await next();
  }
}

describe("UniKvsConfig", () => {
  test("ストレージを追加して create すると UniKvs インスタンスが生成される", ({ expect }) => {
    // 準備
    const config = new UniKvsConfig(UniKvs);

    // 実行
    const result = config.persist(new FakeStorage()).create();

    // 検証
    expect(result).toBeInstanceOf(UniKvs);
  });

  test("ストレージが未登録のとき create で MissingStorageError を投げる", ({ expect }) => {
    // 準備
    const config = new UniKvsConfig(UniKvs);

    // 実行と検証
    expect(() => config.create()).toThrow(MissingStorageError);
  });

  test("ミドルウェアを追加してからストレージを追加できる", ({ expect }) => {
    // 準備
    const config = new UniKvsConfig(UniKvs);

    // 実行
    const result = config.use(new MockMiddleware()).persist(new FakeStorage()).create();

    // 検証
    expect(result).toBeInstanceOf(UniKvs);
  });

  test("ストレージを追加した後でもミドルウェアを追加できる", ({ expect }) => {
    // 準備
    const config = new UniKvsConfig(UniKvs);

    // 実行
    const result = config
      .persist(new FakeStorage())
      .use(new MockMiddleware())
      .persist(new FakeStorage())
      .create();

    // 検証
    expect(result).toBeInstanceOf(UniKvs);
  });

  test("ミドルウェアとストレージを交互に追加できる", ({ expect }) => {
    // 準備
    const config = new UniKvsConfig(UniKvs);

    // 実行
    const result = config
      .use(new MockMiddleware())
      .use(new MockMiddleware())
      .persist(new FakeStorage())
      .use(new MockMiddleware())
      .persist(new FakeStorage())
      .use(new MockMiddleware())
      .persist(new FakeStorage())
      .create();

    // 検証
    expect(result).toBeInstanceOf(UniKvs);
  });

  test("fork 先で登録したストレージのみでも create できる", async ({ expect }) => {
    // 準備
    const storage = new FakeStorage();

    // 実行
    // UniKvs.config() からは fork のみでは型レベルで create できないため直接構築します。
    await using kvs = new UniKvsConfig(UniKvs).fork(UniKvs.branch().persist(storage)).create();
    await kvs.open();
    await kvs.set("foo", "x");

    // 検証
    expect(kvs).toBeInstanceOf(UniKvs);
    expect(storage.map.get("foo")).toBe("x");
    await expect(kvs.get("foo")).resolves.toBe("x");
  });

  test("fork 内の use は分岐先のストレージにのみ適用される", async ({ expect }) => {
    // 準備
    const mainStorage = new FakeStorage();
    const branchStorage = new FakeStorage();
    // UniKvs.config() からは fork のみでは型レベルで create できないため直接構築します。
    await using kvs = new UniKvsConfig(UniKvs)
      .persist(mainStorage)
      .fork(UniKvs.branch().use(new MockMiddleware()).persist(branchStorage))
      .create();
    await kvs.open();

    // 実行
    await kvs.set("foo", "x");

    // 検証
    expect(mainStorage.map.get("foo")).toBe("x");
    expect(branchStorage.map.get("foo")).toBe("e:x");
    await expect(kvs.get("foo")).resolves.toBe("x");
  });
});
