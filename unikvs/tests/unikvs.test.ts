import type { IStorage } from "@unikvs/core";
import { describe, test, afterEach } from "vitest";

import {
  UniKvsIsOpenError,
  UniKvsIsNotOpenError,
  KeyNotFoundError,
  MissingStorageError,
} from "../src/errors.js";
import UniKvsConfig from "../src/unikvs-config.js";
import UniKvs from "../src/unikvs.js";

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

function createKvs(): UniKvs {
  const config = new UniKvsConfig(UniKvs) as any;
  return config.appendStorage(new MockStorage()).create();
}

describe("UniKvs - 設定からの生成", () => {
  test("config から生成したとき、create で UniKvs インスタンスが返る", ({ expect }) => {
    // 実行
    const kvs = createKvs();

    // 検証
    expect(kvs).toBeInstanceOf(UniKvs);
  });

  test("ストレージなしで create すると MissingStorageError を投げる", ({ expect }) => {
    // 実行と検証
    expect(() => new UniKvsConfig(UniKvs).create()).toThrow(MissingStorageError);
  });
});

describe("UniKvs - オープン / クローズ", () => {
  test("open すると isOpen が true になる", async ({ expect }) => {
    // 準備
    const kvs = createKvs();

    // 実行
    await kvs.open();

    // 検証
    expect(kvs.isOpen).toBe(true);

    // 後片付け
    await kvs.close();
  });

  test("close すると isOpen が false になる", async ({ expect }) => {
    // 準備
    const kvs = createKvs();
    await kvs.open();

    // 実行
    await kvs.close();

    // 検証
    expect(kvs.isOpen).toBe(false);
  });

  test("既に開いているときに open すると UniKvsIsOpenError を投げる", async ({ expect }) => {
    // 準備
    const kvs = createKvs();
    await kvs.open();

    // 実行と検証
    await expect(kvs.open()).rejects.toThrow(UniKvsIsOpenError);

    // 後片付け
    await kvs.close();
  });

  test("閉じているときに close すると UniKvsIsNotOpenError を投げる", async ({ expect }) => {
    // 準備
    const kvs = createKvs();

    // 実行と検証
    await expect(kvs.close()).rejects.toThrow(UniKvsIsNotOpenError);
  });

  test("close 後に再 open できる", async ({ expect }) => {
    // 準備
    const kvs = createKvs();
    await kvs.open();
    await kvs.close();

    // 実行
    await kvs.open();
    await kvs.close();

    // 検証
    expect(kvs.isOpen).toBe(false);
  });
});

describe("UniKvs - 基本操作 (CRUD)", () => {
  let kvs: UniKvs;

  afterEach(async () => {
    if (kvs.isOpen) {
      await kvs.close();
    }
  });

  test("値を set して get できる", async ({ expect }) => {
    // 準備
    kvs = createKvs();
    await kvs.open();

    // 実行
    await kvs.set("key1", "value1");
    const result = await kvs.get("key1");

    // 検証
    expect(result).toBe("value1");
  });

  test("has で値の存在確認ができる", async ({ expect }) => {
    // 準備
    kvs = createKvs();
    await kvs.open();
    await kvs.set("key1", "value1");

    // 実行
    const exists = await kvs.has("key1");
    const notExists = await kvs.has("key2");

    // 検証
    expect(exists).toBe(true);
    expect(notExists).toBe(false);
  });

  test("delete で値を削除できる", async ({ expect }) => {
    // 準備
    kvs = createKvs();
    await kvs.open();
    await kvs.set("key1", "value1");

    // 実行
    await kvs.delete("key1");

    // 検証
    expect(await kvs.has("key1")).toBe(false);
  });

  test("clear ですべての値を削除できる", async ({ expect }) => {
    // 準備
    kvs = createKvs();
    await kvs.open();
    await kvs.set("key1", "value1");
    await kvs.set("key2", "value2");

    // 実行
    await kvs.clear();

    // 検証
    expect(await kvs.has("key1")).toBe(false);
    expect(await kvs.has("key2")).toBe(false);
  });

  test("存在しないキーを get すると KeyNotFoundError を投げる", async ({ expect }) => {
    // 準備
    kvs = createKvs();
    await kvs.open();

    // 実行と検証
    await expect(kvs.get("nonexistent")).rejects.toThrow(KeyNotFoundError);
  });

  test("オプションオブジェクト形式で set できる", async ({ expect }) => {
    // 準備
    kvs = createKvs();
    await kvs.open();

    // 実行
    await kvs.set({ key: "foo", value: "bar" });
    const result = await kvs.get({ key: "foo" });

    // 検証
    expect(result).toBe("bar");
  });

  test("set 時に閉じていると UniKvsIsNotOpenError を投げる", async ({ expect }) => {
    // 準備
    kvs = createKvs();

    // 実行と検証
    await expect(kvs.set("key1", "value1")).rejects.toThrow(UniKvsIsNotOpenError);
  });

  test("get 時に閉じていると UniKvsIsNotOpenError を投げる", async ({ expect }) => {
    // 準備
    kvs = createKvs();

    // 実行と検証
    await expect(kvs.get("key1")).rejects.toThrow(UniKvsIsNotOpenError);
  });
});

describe("UniKvs - トランスフォーマー連携", () => {
  let kvs: UniKvs;

  afterEach(async () => {
    if (kvs.isOpen) {
      await kvs.close();
    }
  });

  test("トランスフォーマーを通して値が変換される", async ({ expect }) => {
    // 準備
    kvs = createKvs();
    await kvs.open();

    // 実行
    await kvs.set("key1", "hello");
    const result = await kvs.get("key1");

    // 検証
    expect(result).toBe("hello");
  });
});

describe("UniKvs - Symbol.asyncDispose", () => {
  test("asyncDispose で close できる", async ({ expect }) => {
    // 準備
    const kvs = createKvs();
    await kvs.open();

    // 実行
    await kvs[Symbol.asyncDispose]();

    // 検証
    expect(kvs.isOpen).toBe(false);
  });
});
