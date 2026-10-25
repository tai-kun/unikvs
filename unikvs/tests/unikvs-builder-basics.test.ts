import type { IMiddleware } from "@unikvs/core";
import { test, describe } from "vite-plus/test";

import { MissingStorageError } from "../src/errors.js";
import { Branch, Builder } from "../src/index.js";
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
    c.destination = String(c.source).replace(/^e:/u, "");
    await next();
  }
}

describe("Builder", () => {
  test("ストレージを追加して build すると UniKvs インスタンスが生成される", ({ expect }) => {
    // 準備：
    const builder = new Builder();

    // 実行：
    const result = builder.persist(new FakeStorage()).build();

    // 検証：
    expect(result).toBeInstanceOf(UniKvs);
  });

  test("ストレージが未登録のとき build で MissingStorageError を投げる", ({ expect }) => {
    // 準備：
    const builder = new Builder();

    // 実行と検証：
    expect(() => builder.build()).toThrow(MissingStorageError);
  });

  test("ミドルウェアを追加してからストレージを追加できる", ({ expect }) => {
    // 準備：
    const builder = new Builder();

    // 実行：
    const result = builder.use(new MockMiddleware()).persist(new FakeStorage()).build();

    // 検証：
    expect(result).toBeInstanceOf(UniKvs);
  });

  test("ストレージを追加した後でもミドルウェアを追加できる", ({ expect }) => {
    // 準備：
    const builder = new Builder();

    // 実行：
    const result = builder
      .persist(new FakeStorage())
      .use(new MockMiddleware())
      .persist(new FakeStorage())
      .build();

    // 検証：
    expect(result).toBeInstanceOf(UniKvs);
  });

  test("ミドルウェアとストレージを交互に追加できる", ({ expect }) => {
    // 準備：
    const builder = new Builder();

    // 実行：
    const result = builder
      .use(new MockMiddleware())
      .use(new MockMiddleware())
      .persist(new FakeStorage())
      .use(new MockMiddleware())
      .persist(new FakeStorage())
      .use(new MockMiddleware())
      .persist(new FakeStorage())
      .build();

    // 検証：
    expect(result).toBeInstanceOf(UniKvs);
  });

  test("fork 先で登録したストレージのみでも build できる", async ({ expect }) => {
    // 準備：
    const storage = new FakeStorage();

    // 実行：
    // new Builder() からは fork のみでは型レベルで build できないため直接構築します。
    // @ts-expect-error: persist なしでは型レベルで build できないが、実行時は動作します。
    await using kvs = new Builder().fork(new Branch().persist(storage)).build();
    await kvs.open();
    await kvs.set("foo", "x");

    // 検証：
    expect(kvs).toBeInstanceOf(UniKvs);
    expect(storage.map.get("foo")).toBe("x");
    await expect(kvs.get("foo")).resolves.toBe("x");
  });

  test("fork 内の use は分岐先のストレージにのみ適用される", async ({ expect }) => {
    // 準備：
    const mainStorage = new FakeStorage();
    const branchStorage = new FakeStorage();
    // new Builder() からは fork のみでは型レベルで build できないため直接構築します。
    await using kvs = new Builder()
      .persist(mainStorage)
      .fork(new Branch().use(new MockMiddleware()).persist(branchStorage))
      .build();
    await kvs.open();

    // 実行：
    await kvs.set("foo", "x");

    // 検証：
    expect(mainStorage.map.get("foo")).toBe("x");
    expect(branchStorage.map.get("foo")).toBe("e:x");
    await expect(kvs.get("foo")).resolves.toBe("x");
  });
});
