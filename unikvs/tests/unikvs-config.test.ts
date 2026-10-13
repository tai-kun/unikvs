import type { IStorage, ITransformer } from "@unikvs/core";
import { describe, test } from "vitest";

import { MissingStorageError } from "../src/errors.js";
import UniKvsConfig from "../src/unikvs-config.js";
import UniKvs from "../src/unikvs.js";
import { FakeStorage } from "./_helpers.js";

/**
 * create の動作確認に使用する、Map 上にデータを保存するだけのストレージモックです。
 */
class MockStorage implements IStorage {
  readonly name = "MockStorage";
  isOpen = true;
  private readonly map = new Map<string, any>();

  async write(args: IStorage.WriteArgs): Promise<void> {
    this.map.set(args.key, args.data);
  }

  async read(args: IStorage.ReadArgs): Promise<unknown> {
    return this.map.get(args.key);
  }

  async exists(args: IStorage.ExistsArgs): Promise<boolean> {
    return this.map.has(args.key);
  }

  async delete(args: IStorage.DeleteArgs): Promise<void> {
    this.map.delete(args.key);
  }

  async clear(_args: IStorage.ClearArgs): Promise<void> {
    this.map.clear();
  }
}

/**
 * encode 時に "e:" 接頭辞を付与し、decode 時に除去するトランスフォーマーモックです。
 */
class MockTransformer implements ITransformer {
  readonly name = "MockTransformer";
  readonly isOpen = true;

  async encode(args: ITransformer.EncodeArgs): Promise<unknown> {
    return `e:${args.data}`;
  }

  async decode(args: ITransformer.DecodeArgs): Promise<unknown> {
    const s = args.data as string;
    return s.replace(/^e:/, "");
  }
}

describe("UniKvsConfig", () => {
  test("ストレージを追加して create すると UniKvs インスタンスが生成される", ({ expect }) => {
    // 準備
    const config = new UniKvsConfig(UniKvs);

    // 実行
    const result = config.persist(new MockStorage()).create();

    // 検証
    expect(result).toBeInstanceOf(UniKvs);
  });

  test("ストレージが未登録のとき create で MissingStorageError を投げる", ({ expect }) => {
    // 準備
    const config = new UniKvsConfig(UniKvs);

    // 実行と検証
    expect(() => config.create()).toThrow(MissingStorageError);
  });

  test("トランスフォーマーを追加してからストレージを追加できる", ({ expect }) => {
    // 準備
    const config = new UniKvsConfig(UniKvs);

    // 実行
    const result = config.connect(new MockTransformer()).persist(new MockStorage()).create();

    // 検証
    expect(result).toBeInstanceOf(UniKvs);
  });

  test("ストレージを追加した後でもトランスフォーマーを追加できる", ({ expect }) => {
    // 準備
    const config = new UniKvsConfig(UniKvs);

    // 実行
    const result = config
      .persist(new MockStorage())
      .connect(new MockTransformer())
      .persist(new MockStorage())
      .create();

    // 検証
    expect(result).toBeInstanceOf(UniKvs);
  });

  test("トランスフォーマーとストレージを交互に追加できる", ({ expect }) => {
    // 準備
    const config = new UniKvsConfig(UniKvs);

    // 実行
    const result = config
      .connect(new MockTransformer())
      .connect(new MockTransformer())
      .persist(new MockStorage())
      .connect(new MockTransformer())
      .persist(new MockStorage())
      .connect(new MockTransformer())
      .persist(new MockStorage())
      .create();

    // 検証
    expect(result).toBeInstanceOf(UniKvs);
  });

  test("fork 先で登録したストレージのみでも create できる", async ({ expect }) => {
    // 準備
    const storage = new FakeStorage();

    // 実行
    // UniKvs.config() からは fork のみでは型レベルで create できないため直接構築します。
    const kvs = new UniKvsConfig(UniKvs).fork(UniKvs.branch().persist(storage)).create();
    await kvs.open();
    await kvs.set("foo", "x");

    // 検証
    expect(kvs).toBeInstanceOf(UniKvs);
    expect(storage.map.get("foo")).toBe("x");
    expect(await kvs.get("foo")).toBe("x");

    // 後片付け
    await kvs.close();
  });

  test("fork 内の connect は分岐先のストレージにのみ適用される", async ({ expect }) => {
    // 準備
    const mainStorage = new FakeStorage();
    const branchStorage = new FakeStorage();
    // UniKvs.config() からは fork のみでは型レベルで create できないため直接構築します。
    const kvs = new UniKvsConfig(UniKvs)
      .persist(mainStorage)
      .fork(UniKvs.branch().connect(new MockTransformer()).persist(branchStorage))
      .create();
    await kvs.open();

    // 実行
    await kvs.set("foo", "x");

    // 検証
    expect(mainStorage.map.get("foo")).toBe("x");
    expect(branchStorage.map.get("foo")).toBe("e:x");
    expect(await kvs.get("foo")).toBe("x");

    // 後片付け
    await kvs.close();
  });
});
