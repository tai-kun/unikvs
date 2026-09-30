import { describe, test as vitest } from "vitest";

import { InvalidChunkTypeError, KeyNotFoundError } from "../src/errors.js";
import Memory from "../src/memory.js";

/**
 * テストごとに空の Memory インスタンスを提供します。
 * ストリーム経由の読み書きの振る舞いを検証するために使用します。
 */
const test = vitest.extend<{ storage: Memory }>({
  // oxlint-disable-next-line no-empty-pattern
  async storage({}, use) {
    await use(new Memory());
  },
});

/**
 * Promise の拒否理由を返します。
 * ストリームが非同期に拒否するエラーの種類を検証するために使用します。
 */
async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }

  throw new Error("Promise が拒否されませんでした");
}

describe("getWritable", () => {
  test("長さの異なる複数のチャンクを順番どおり結合して保存する", async ({ expect, storage }) => {
    // 準備
    const key = "s1";
    const writer = storage.getWritable({ key }).getWriter();

    // 実行
    await writer.write(new Uint8Array([1, 2, 3]));
    await writer.write(new Uint8Array([4]));
    await writer.write(new Uint8Array([5, 6]));
    await writer.close();

    // 検証
    expect(storage.read({ key })).toStrictEqual(new Uint8Array([1, 2, 3, 4, 5, 6]));
  });

  test("書き込み後に元のチャンクを変更しても保存値は変わらない", async ({ expect, storage }) => {
    // 準備
    const key = "s1";
    const chunk = new Uint8Array([1, 2, 3]);
    const writer = storage.getWritable({ key }).getWriter();

    // 実行
    await writer.write(chunk);
    chunk[0] = 99;
    await writer.close();

    // 検証
    expect(storage.read({ key })).toStrictEqual(new Uint8Array([1, 2, 3]));
  });

  test("close するまで値は保存されない", async ({ expect, storage }) => {
    // 準備
    const key = "s1";
    const writer = storage.getWritable({ key }).getWriter();

    // 実行
    await writer.write(new Uint8Array([1]));
    const existsBeforeClose = storage.exists({ key });
    await writer.close();

    // 検証
    expect(existsBeforeClose).toBe(false);
    expect(storage.exists({ key })).toBe(true);
  });

  test("空のストリームを close したとき、長さ 0 の値が保存される", async ({ expect, storage }) => {
    // 準備
    const key = "s1";
    const writer = storage.getWritable({ key }).getWriter();

    // 実行
    await writer.close();

    // 検証
    expect(storage.exists({ key })).toBe(true);
    expect(storage.read({ key })).toStrictEqual(new Uint8Array(0));
  });

  test("abort したとき値は保存されない", async ({ expect, storage }) => {
    // 準備
    const key = "s1";
    const writer = storage.getWritable({ key }).getWriter();

    // 実行
    await writer.write(new Uint8Array([1, 2]));
    await writer.abort();

    // 検証
    expect(storage.exists({ key })).toBe(false);
    await expect(writer.closed).rejects.toBeUndefined();
  });

  test("Uint8Array 以外のチャンクを書き込むと InvalidChunkTypeError で拒否される", async ({
    expect,
    storage,
  }) => {
    // 準備
    const key = "s1";
    const writer = storage.getWritable({ key }).getWriter();

    // 実行
    const error = await captureRejection(
      writer.write("invalid" as unknown as Uint8Array<ArrayBuffer>),
    );

    // 検証
    expect(error).toBeInstanceOf(InvalidChunkTypeError);
    expect(storage.exists({ key })).toBe(false);
  });

  test("既存の値を上書きする", async ({ expect, storage }) => {
    // 準備
    const key = "s1";
    storage.write({ key, data: new Uint8Array([9]) });
    const writer = storage.getWritable({ key }).getWriter();

    // 実行
    await writer.write(new Uint8Array([1, 2]));
    await writer.close();

    // 検証
    expect(storage.read({ key })).toStrictEqual(new Uint8Array([1, 2]));
  });

  test("削除したキーへ再度ストリームで書き込める", async ({ expect, storage }) => {
    // 準備
    const key = "s1";
    storage.write({ key, data: new Uint8Array([9]) });
    storage.delete({ key });
    const writer = storage.getWritable({ key }).getWriter();

    // 実行
    await writer.write(new Uint8Array([1]));
    await writer.close();

    // 検証
    expect(storage.read({ key })).toStrictEqual(new Uint8Array([1]));
  });

  test("100 KB のチャンクを複数書き込んでも byte-for-byte で一致する", async ({
    expect,
    storage,
  }) => {
    // 準備
    const key = "s1";
    const chunks = [
      new Uint8Array(100_000).fill(1),
      new Uint8Array(100_000).fill(2),
      new Uint8Array(100_000).fill(3),
    ];
    const expected = new Uint8Array(300_000);
    expected.fill(1, 0, 100_000);
    expected.fill(2, 100_000, 200_000);
    expected.fill(3, 200_000);

    // 実行
    const writer = storage.getWritable({ key }).getWriter();
    for (const chunk of chunks) {
      await writer.write(chunk);
    }
    await writer.close();

    // 検証
    expect(storage.read({ key })).toStrictEqual(expected);
  });
});

describe("getReadable", () => {
  test("存在しないキーでは KeyNotFoundError を投げる", ({ expect, storage }) => {
    // 実行と検証
    expect(() => storage.getReadable({ key: "unknown" })).toThrow(KeyNotFoundError);
  });

  test("保存値を単一チャンクとして送出する", async ({ expect, storage }) => {
    // 準備
    const key = "s1";
    const data = new Uint8Array([1, 2, 3]);
    storage.write({ key, data });

    // 実行
    const reader = storage.getReadable({ key }).getReader();
    const first = await reader.read();
    const second = await reader.read();

    // 検証
    expect(first.done).toBe(false);
    expect(first.value).toStrictEqual(data);
    expect(second.done).toBe(true);
    expect(second.value).toBe(undefined);
  });

  test("同じキーから複数回読み取っても同じ値を得られる", async ({ expect, storage }) => {
    // 準備
    const key = "s1";
    storage.write({ key, data: new Uint8Array([1, 2]) });
    const firstReader = storage.getReadable({ key }).getReader();
    const secondReader = storage.getReadable({ key }).getReader();

    // 実行
    const first = await firstReader.read();
    const second = await secondReader.read();

    // 検証
    expect(first.value).toStrictEqual(new Uint8Array([1, 2]));
    expect(second.value).toStrictEqual(new Uint8Array([1, 2]));
  });

  test("reader.cancel しても保存値は変わらない", async ({ expect, storage }) => {
    // 準備
    const key = "s1";
    const data = new Uint8Array([1, 2, 3]);
    storage.write({ key, data });
    const reader = storage.getReadable({ key }).getReader();

    // 実行
    await reader.cancel();

    // 検証
    expect(storage.read({ key })).toStrictEqual(data);
  });

  test("読み取り中に同じキーを書き換えても進行中のストリームは元の値を送出する", async ({
    expect,
    storage,
  }) => {
    // 準備
    const key = "s1";
    storage.write({ key, data: new Uint8Array([1, 2]) });
    const reader = storage.getReadable({ key }).getReader();

    // 実行
    storage.write({ key, data: new Uint8Array([3, 4]) });
    const { value } = await reader.read();

    // 検証
    expect(value).toStrictEqual(new Uint8Array([1, 2]));
  });

  test("ストリーム経由の読み取り結果は通常の read と byte-for-byte で一致する", async ({
    expect,
    storage,
  }) => {
    // 準備
    const key = "s1";
    storage.write({ key, data: new Uint8Array([0, 1, 2, 255]) });
    const reader = storage.getReadable({ key }).getReader();

    // 実行
    const { value } = await reader.read();

    // 検証
    expect(value).toStrictEqual(storage.read({ key }));
  });
});
