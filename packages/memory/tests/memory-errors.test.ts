import { describe, test as vitest } from "vitest";

import { InvalidChunkTypeError, KeyNotFoundError } from "../src/errors.js";
import Memory from "../src/memory.js";

/**
 * テストごとに空の Memory インスタンスを提供します。
 * エラーのメタ情報とメッセージ、伝播の仕方を検証するために使用します。
 */
const test = vitest.extend<{ storage: Memory }>({
  // oxlint-disable-next-line no-empty-pattern
  async storage({}, use) {
    await use(new Memory());
  },
});

/**
 * 関数を実行して投げられた例外を返します。
 * 実際に投げられたエラーの種類とメタ情報を検証するために使用します。
 */
function captureThrown(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }

  throw new Error("例外が投げられませんでした");
}

/**
 * Promise の拒否理由を返します。
 * ストリームが非同期に拒否するエラーの種類とメタ情報を検証するために使用します。
 */
async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }

  throw new Error("Promise が拒否されませんでした");
}

describe("KeyNotFoundError", () => {
  test("name は UniKvsKeyNotFoundError である", ({ expect }) => {
    // 実行と検証
    expect(new KeyNotFoundError({ key: "k1" }).name).toBe("UniKvsKeyNotFoundError");
  });

  test("Error と KeyNotFoundError を継承している", ({ expect }) => {
    // 実行
    const error = new KeyNotFoundError({ key: "k1" });

    // 検証
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(KeyNotFoundError);
  });

  test("meta にキーを保持する", ({ expect }) => {
    // 実行と検証
    expect(new KeyNotFoundError({ key: "k1" }).meta).toStrictEqual({ key: "k1" });
  });

  test("既定の英語メッセージを返す", ({ expect }) => {
    // 実行と検証
    expect(new KeyNotFoundError({ key: "k1" }).message).toBe("Key not found: k1");
  });

  test("read で投げられたエラーはキーを保持する", ({ expect, storage }) => {
    // 実行
    const error = captureThrown(() => storage.read({ key: "unknown" }));

    // 検証
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect((error as KeyNotFoundError).meta).toStrictEqual({ key: "unknown" });
    expect((error as KeyNotFoundError).message).toBe("Key not found: unknown");
  });

  test("delete で投げられたエラーはキーを保持する", ({ expect, storage }) => {
    // 実行
    const error = captureThrown(() => storage.delete({ key: "unknown" }));

    // 検証
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect((error as KeyNotFoundError).meta).toStrictEqual({ key: "unknown" });
  });

  test("getReadable は同期的にエラーを投げる", ({ expect, storage }) => {
    // 実行
    const error = captureThrown(() => storage.getReadable({ key: "unknown" }));

    // 検証
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect((error as KeyNotFoundError).meta).toStrictEqual({ key: "unknown" });
  });
});

describe("InvalidChunkTypeError", () => {
  test("name は MemoryInvalidChunkTypeError である", ({ expect }) => {
    // 実行と検証
    expect(new InvalidChunkTypeError({ key: "k1", chunk: "x" }).name).toBe(
      "MemoryInvalidChunkTypeError",
    );
  });

  test("Error と InvalidChunkTypeError を継承している", ({ expect }) => {
    // 実行
    const error = new InvalidChunkTypeError({ key: "k1", chunk: "x" });

    // 検証
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(InvalidChunkTypeError);
  });

  test("押し付けられたチャンクと型名を meta に保持する", ({ expect }) => {
    // 準備
    const chunk = { invalid: true };

    // 実行
    const error = new InvalidChunkTypeError({ key: "k1", chunk });

    // 検証
    expect(error.meta.key).toBe("k1");
    expect(error.meta.chunk).toBe(chunk);
    expect(error.meta.chunkType).toBe("Object");
  });

  test("既定の英語メッセージを返す", ({ expect }) => {
    // 実行と検証
    expect(new InvalidChunkTypeError({ key: "k1", chunk: "x" }).message).toBe(
      'Expected chunk for key "k1" is Uint8Array<ArrayBuffer>, but got string',
    );
  });

  test("書き込み時に投げられたエラーはキーとチャンクを保持する", async ({ expect, storage }) => {
    // 準備
    const writer = storage.getWritable({ vars: {}, key: "s1" }).getWriter();

    // 実行
    const error = await captureRejection(
      writer.write("invalid" as unknown as Uint8Array<ArrayBuffer>),
    );

    // 検証
    expect(error).toBeInstanceOf(InvalidChunkTypeError);
    expect((error as InvalidChunkTypeError).meta).toStrictEqual({
      key: "s1",
      chunk: "invalid",
      chunkType: "string",
    });
  });

  test("読み取り時に投げられたエラーは保存値の型名を保持する", async ({ expect, storage }) => {
    // 準備
    storage.write({ vars: {}, key: "k1", data: { a: 1 } });
    const reader = storage.getReadable({ key: "k1" }).getReader();

    // 実行
    const error = await captureRejection(reader.read());

    // 検証
    expect(error).toBeInstanceOf(InvalidChunkTypeError);
    expect((error as InvalidChunkTypeError).meta.key).toBe("k1");
    expect((error as InvalidChunkTypeError).meta.chunk).toStrictEqual({ a: 1 });
    expect((error as InvalidChunkTypeError).meta.chunkType).toBe("Object");
  });
});

describe("エラーの伝播", () => {
  test("ストリームの書き込みエラーは writer.closed へも伝播する", async ({ expect, storage }) => {
    // 準備
    const writer = storage.getWritable({ vars: {}, key: "s1" }).getWriter();
    await captureRejection(writer.write("invalid" as unknown as Uint8Array<ArrayBuffer>));

    // 実行と検証
    await expect(writer.closed).rejects.toThrow(InvalidChunkTypeError);
    expect(storage.exists({ key: "s1" })).toBe(false);
  });
});
