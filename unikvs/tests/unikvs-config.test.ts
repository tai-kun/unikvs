import type { IStorage, ITransformer } from "@unikvs/core";
import { describe, test } from "vitest";

import { MissingStorageError } from "../src/errors.js";
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
    const result = config.appendStorage(new MockStorage()).create();

    // 検証
    expect(result).toBeInstanceOf(UniKvs);
  });

  test("ストレージが未登録のとき create で MissingStorageError を投げる", ({ expect }) => {
    // 準備
    const config = new UniKvsConfig(UniKvs);

    // 実行と検証
    expect(() => config.create()).toThrow(MissingStorageError);
  });

  test("setContext でコンテキストを設定できる", ({ expect }) => {
    // 準備
    const config = new UniKvsConfig(UniKvs);

    // 実行
    const result = config.setContext({ key1: "value1" });

    // 検証
    expect(result).toBe(config);
  });

  test("setContext に配列を渡すとオブジェクトに変換される", ({ expect }) => {
    // 準備
    const config = new UniKvsConfig(UniKvs);

    // 実行
    const result = config.setContext([
      ["a", 1],
      ["b", 2],
    ]);

    // 検証
    expect(result).toBe(config);
  });

  test("トランスフォーマーを追加してからストレージを追加できる", ({ expect }) => {
    // 準備
    const config = new UniKvsConfig(UniKvs);

    // 実行
    const result = config
      .appendTransformer(new MockTransformer())
      .appendStorage(new MockStorage())
      .create();

    // 検証
    expect(result).toBeInstanceOf(UniKvs);
  });

  test("appendStorage の戻り値で setContext を呼べる", ({ expect }) => {
    // 準備
    const config = new UniKvsConfig(UniKvs);

    // 実行
    const result = config.appendStorage(new MockStorage()).setContext({ foo: "bar" }).create();

    // 検証
    expect(result).toBeInstanceOf(UniKvs);
  });
});
