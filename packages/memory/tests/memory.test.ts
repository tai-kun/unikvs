import type { IStorage } from "@unikvs/core";
import {
  createGetContext,
  createHasContext,
  createSetContext,
  createClearContext,
  createDeleteContext,
  createStreamContext,
} from "@unikvs/testing";
import { test, describe, beforeEach } from "vite-plus/test";

import { KeyNotFoundError, InvalidChunkTypeError } from "../src/errors.js";
import Memory from "../src/memory.js";

/**
 * 値が undefined でないことを表明して取り出します。
 */
function unwrap<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error("想定外の undefined です。");
  }

  return value;
}

describe("初期化と接続管理", () => {
  let storage: Memory;
  beforeEach(() => {
    storage = new Memory();
  });
  test("初期状態のとき、isOpen は true である", ({ expect }) => {
    // 実行と検証：
    expect(storage.isOpen).toBe(true);
  });
});

describe("基本操作（CRUD）", () => {
  let storage: Memory;
  beforeEach(() => {
    storage = new Memory();
  });
  test("データを保存したとき、そのキーでデータを取得できる", ({ expect }) => {
    // 準備：
    const key = "k1";
    const data = "v1";

    // 実行：
    storage.write(createSetContext(key) as IStorage.WriteContext, data);

    const result = storage.read(createGetContext(key) as IStorage.ReadContext);

    // 検証：
    expect(result).toBe(data);
  });
  test("データが存在するとき、exists が true を返す", ({ expect }) => {
    // 準備：
    const key = "k1";
    storage.write(createSetContext(key) as IStorage.WriteContext, "v1");

    // 実行：
    const result = storage.exists(createHasContext(key) as IStorage.ExistsContext);

    // 検証：
    expect(result).toBe(true);
  });
  test("データが存在しないとき、exists が false を返す", ({ expect }) => {
    // 実行：
    const result = storage.exists(createHasContext("none") as IStorage.ExistsContext);

    // 検証：
    expect(result).toBe(false);
  });
  test("データを削除したとき、そのデータが存在しなくなる", ({ expect }) => {
    // 準備：
    const key = "k1";
    storage.write(createSetContext(key) as IStorage.WriteContext, "v1");

    // 実行：
    storage.delete(createDeleteContext(key) as IStorage.DeleteContext);

    // 検証：
    expect(storage.exists(createHasContext(key) as IStorage.ExistsContext)).toBe(false);
  });
  test("全データを消去したとき、すべてのキーが存在しなくなる", ({ expect }) => {
    // 準備：
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    storage.write(createSetContext("k2") as IStorage.WriteContext, "v2");

    // 実行：
    storage.clear(createClearContext() as IStorage.ClearContext);

    // 検証：
    expect(storage.exists(createHasContext("k1") as IStorage.ExistsContext)).toBe(false);
    expect(storage.exists(createHasContext("k2") as IStorage.ExistsContext)).toBe(false);
  });
  test("既存のキーに対してデータを書き込んだとき、値が更新される", ({ expect }) => {
    // 準備：
    const key = "k1";
    storage.write(createSetContext(key) as IStorage.WriteContext, "v1");

    // 実行：
    storage.write(createSetContext(key) as IStorage.WriteContext, "v2");

    const result = storage.read(createGetContext(key) as IStorage.ReadContext);

    // 検証：
    expect(result).toBe("v2");
  });
});

describe("ストリーム操作", () => {
  let storage: Memory;
  beforeEach(() => {
    storage = new Memory();
  });
  test("WritableStream を使用して書き込んだとき、結合された Uint8Array として取得できる", async ({
    expect,
  }) => {
    // 準備：

    const key = "s1";
    const writable = storage.getWritable(createSetContext(key) as IStorage.GetWritableContext);
    const writer = writable.getWriter();

    // 実行：
    await writer.write(new Uint8Array([1, 2]));
    await writer.write(new Uint8Array([3]));
    await writer.close();

    // 検証：
    const result = storage.read(createGetContext(key) as IStorage.ReadContext);
    expect(result).toStrictEqual(new Uint8Array([1, 2, 3]));
  });
  test("ReadableStream を使用して読み取ったとき、保存されているバイナリデータを正常に抽出できる", async ({
    expect,
  }) => {
    // 準備：

    const key = "s1";
    const data = new Uint8Array([1, 2, 3]);
    storage.write(createSetContext(key) as IStorage.WriteContext, data);

    // 実行：
    const readable = storage.getReadable(createStreamContext(key) as IStorage.GetReadableContext);
    const reader = readable.getReader();
    const chunks: number[] = [];

    while (true) {
      const { done, value } = await reader.read();

      // oxlint-disable-next-line vitest/no-conditional-in-test -- ポーリング／後始末の条件分岐はテストの進行に必須のため、使用します。
      if (done) {
        break;
      }

      // oxlint-disable-next-line vitest/no-conditional-in-test -- ポーリング／後始末の条件分岐はテストの進行に必須のため、使用します。
      if (value !== undefined) {
        chunks.push(...Array.from(value));
      }
    }

    // 検証：
    expect(new Uint8Array(chunks)).toStrictEqual(data);
  });
  test("空のストリームを書き込んだとき、長さ 0 の Uint8Array が保存される", async ({ expect }) => {
    // 準備：

    const key = "s2";
    const writable = storage.getWritable(createSetContext(key) as IStorage.GetWritableContext);

    // 実行：
    await writable.getWriter().close();

    // 検証：
    const result = storage.read(createGetContext(key) as IStorage.ReadContext);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result?.length).toBe(0);
  });
});

describe("異常系・エラーハンドリング", () => {
  let storage: Memory;
  beforeEach(() => {
    storage = new Memory();
  });
  test("未登録のキーを読み取ろうとしたとき、KeyNotFoundError が発生する", ({ expect }) => {
    // 実行と検証：
    expect(() => storage.read(createGetContext("unknown") as IStorage.ReadContext)).toThrow(
      KeyNotFoundError,
    );
  });
  test("未登録のキーを削除しようとしたとき、KeyNotFoundError が発生する", ({ expect }) => {
    // 実行と検証：
    expect(() => {
      storage.delete(createDeleteContext("unknown") as IStorage.DeleteContext);
    }).toThrow(KeyNotFoundError);
  });
  test("WritableStream に Uint8Array 以外の型を書き込んだとき、InvalidChunkTypeError が発生する", async ({
    expect,
  }) => {
    // 準備：
    const writable = storage.getWritable(createSetContext("s1") as IStorage.GetWritableContext);
    const writer = writable.getWriter();

    // 実行と検証：
    // ストリームの書き込みエラーは通常 writer.closed や write() の Promise 拒否で発生します。
    await expect(
      writer.write("invalid chunk" as unknown as Uint8Array<ArrayBuffer>),
    ).rejects.toThrow(InvalidChunkTypeError);
  });
  test("バイナリデータではないキーに対して ReadableStream を取得して読み取ったとき、InvalidChunkTypeError が発生する", async ({
    expect,
  }) => {
    // 準備：
    const key = "k1";

    // オブジェクトを保存します。
    storage.write(createSetContext(key) as IStorage.WriteContext, { a: 1 });

    // 実行：
    const readable = storage.getReadable(createStreamContext(key) as IStorage.GetReadableContext);
    const reader = readable.getReader();

    // 検証：
    await expect(reader.read()).rejects.toThrow(InvalidChunkTypeError);
  });
});

describe("境界値・特殊ケース", () => {
  let storage: Memory;
  beforeEach(() => {
    storage = new Memory();
  });
  test("空文字のキーを使用しても、正常に保存と取得ができる", ({ expect }) => {
    // 準備：
    const key = "";
    const data = "empty key data";

    // 実行：
    storage.write(createSetContext(key) as IStorage.WriteContext, data);

    // 検証：
    expect(storage.read(createGetContext(key) as IStorage.ReadContext)).toBe(data);
    expect(storage.exists(createHasContext(key) as IStorage.ExistsContext)).toBe(true);
  });
  test("特殊文字を含むキーを使用しても、正常に保存と取得ができる", ({ expect }) => {
    // 準備：
    const key = "path/to/key!@#";
    const data = "special key data";

    // 実行：
    storage.write(createSetContext(key) as IStorage.WriteContext, data);

    // 検証：
    expect(storage.read(createGetContext(key) as IStorage.ReadContext)).toBe(data);
  });
  test("null または undefined を保存したとき、そのままの値が取得できる", ({ expect }) => {
    // 実行：
    storage.write(createSetContext("null-key") as IStorage.WriteContext, null);
    storage.write(createSetContext("undefined-key") as IStorage.WriteContext, undefined);

    // 検証：
    expect(storage.read(createGetContext("null-key") as IStorage.ReadContext)).toBe(null);
    expect(storage.read(createGetContext("undefined-key") as IStorage.ReadContext)).toBe(undefined);
  });
  test("巨大なバイナリデータを保存したとき、整合性を保ったまま取得できる", ({ expect }) => {
    // 準備：
    // 10 MB のデータを用意します。
    const size = 10 * 1024 * 1024;
    const bigData = new Uint8Array(size).fill(1);
    const key = "large-data";

    // 実行：
    storage.write(createSetContext(key) as IStorage.WriteContext, bigData);

    const result = storage.read(createGetContext(key) as IStorage.ReadContext);

    // 検証：
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result?.length).toBe(size);
    expect(result?.[0]).toBe(1);
    expect(result?.[size - 1]).toBe(1);
  });
});

describe("データの隔離", () => {
  test("書き込んだバッファを変更したとき、保存値は変わらない", ({ expect }) => {
    // 準備：
    const storage = new Memory();
    const source = new Uint8Array([1, 2, 3]);
    storage.write(createSetContext("k1") as IStorage.WriteContext, source);

    // 実行：
    source[0] = 99;

    // 検証：
    expect(storage.read(createGetContext("k1") as IStorage.ReadContext)).toStrictEqual(
      new Uint8Array([1, 2, 3]),
    );
  });

  test("読み取った値を変更したとき、保存値は変わらない", ({ expect }) => {
    // 準備：
    const storage = new Memory();
    storage.write(createSetContext("k1") as IStorage.WriteContext, new Uint8Array([1, 2, 3]));

    // 実行：
    storage.read(createGetContext("k1") as IStorage.ReadContext)[0] = 99;

    // 検証：
    expect(storage.read(createGetContext("k1") as IStorage.ReadContext)).toStrictEqual(
      new Uint8Array([1, 2, 3]),
    );
  });

  test("ストリームで読み取ったチャンクを変更したとき、保存値は変わらない", async ({ expect }) => {
    // 準備：
    const storage = new Memory();
    storage.write(createSetContext("s1") as IStorage.WriteContext, new Uint8Array([1, 2, 3]));

    const reader = storage
      .getReadable(createStreamContext("s1") as IStorage.GetReadableContext)
      .getReader();

    // 実行：
    const { value } = await reader.read();
    unwrap(value)[0] = 99;
    reader.releaseLock();

    // 検証：
    expect(storage.read(createGetContext("s1") as IStorage.ReadContext)).toStrictEqual(
      new Uint8Array([1, 2, 3]),
    );
  });

  test("入れ子の値を変更したとき、保存値は変わらない", ({ expect }) => {
    // 準備：
    const storage = new Memory();
    const source = { nested: { list: [1, 2, 3] } };
    storage.write(createSetContext("k1") as IStorage.WriteContext, source);

    // 実行：
    source.nested.list[0] = 99;

    // 検証：
    expect(storage.read(createGetContext("k1") as IStorage.ReadContext)).toStrictEqual({
      nested: { list: [1, 2, 3] },
    });
  });

  test("clone に関数を指定したとき、その関数で複製する", ({ expect }) => {
    // 準備：
    const storage = new Memory({ clone: <T>(value: T): T => value });
    const source = new Uint8Array([1, 2, 3]);

    // 実行：
    storage.write(createSetContext("k1") as IStorage.WriteContext, source);

    // 検証：
    expect(storage.read(createGetContext("k1") as IStorage.ReadContext)).toBe(source);
  });
});
