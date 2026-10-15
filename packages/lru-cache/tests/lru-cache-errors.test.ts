import type { IStorage } from "@unikvs/core";
import {
  captureRejection,
  captureThrown,
  createDeleteContext,
  createGetContext,
  createHasContext,
  createOpenContext,
  createSetContext,
  createStreamContext,
} from "@unikvs/testing";
import { describe, test as vitest } from "vitest";

import {
  InvalidChunkTypeError,
  InvalidMaxBytesError,
  InvalidMaxEntriesError,
  InvalidSizeOfResultError,
  KeyNotFoundError,
} from "../src/errors.js";
import LruCache from "../src/lru-cache.js";

/**
 * テストごとに open 済みの LruCache インスタンスを提供します。
 * エラーのメタ情報とメッセージ、伝播の仕方を検証するために使用します。
 */
const test = vitest.extend<{ storage: LruCache }>({
  // oxlint-disable-next-line no-empty-pattern
  async storage({}, use) {
    const storage = new LruCache();
    await storage.open(createOpenContext() as IStorage.OpenContext);
    await use(storage);
  },
});

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
    const error = captureThrown(() =>
      storage.read(createGetContext("unknown") as IStorage.ReadContext),
    );

    // 検証
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect((error as KeyNotFoundError).meta).toStrictEqual({ key: "unknown" });
    expect((error as KeyNotFoundError).message).toBe("Key not found: unknown");
  });

  test("delete で投げられたエラーはキーを保持する", ({ expect, storage }) => {
    // 実行
    const error = captureThrown(() =>
      storage.delete(createDeleteContext("unknown") as IStorage.DeleteContext),
    );

    // 検証
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect((error as KeyNotFoundError).meta).toStrictEqual({ key: "unknown" });
  });

  test("getReadable は同期的にエラーを投げる", ({ expect, storage }) => {
    // 実行
    const error = captureThrown(() =>
      storage.getReadable(createStreamContext("unknown") as IStorage.GetReadableContext),
    );

    // 検証
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect((error as KeyNotFoundError).meta).toStrictEqual({ key: "unknown" });
  });
});

describe("InvalidChunkTypeError", () => {
  test("name は LruCacheInvalidChunkTypeError である", ({ expect }) => {
    // 実行と検証
    expect(new InvalidChunkTypeError({ key: "k1", chunk: "x" }).name).toBe(
      "LruCacheInvalidChunkTypeError",
    );
  });

  test("Error と InvalidChunkTypeError を継承している", ({ expect }) => {
    // 実行
    const error = new InvalidChunkTypeError({ key: "k1", chunk: "x" });

    // 検証
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(InvalidChunkTypeError);
  });

  test("渡されたチャンクと型名を meta に保持する", ({ expect }) => {
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
    const writer = storage
      .getWritable(createSetContext("s1") as IStorage.GetWritableContext)
      .getWriter();

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
    storage.write(createSetContext("k1") as IStorage.WriteContext, { a: 1 });
    const reader = storage
      .getReadable(createStreamContext("k1") as IStorage.GetReadableContext)
      .getReader();

    // 実行
    const error = await captureRejection(reader.read());

    // 検証
    expect(error).toBeInstanceOf(InvalidChunkTypeError);
    expect((error as InvalidChunkTypeError).meta.key).toBe("k1");
    expect((error as InvalidChunkTypeError).meta.chunk).toStrictEqual({ a: 1 });
    expect((error as InvalidChunkTypeError).meta.chunkType).toBe("Object");
  });
});

describe("InvalidMaxEntriesError", () => {
  test("name は LruCacheInvalidMaxEntriesError である", ({ expect }) => {
    // 実行と検証
    expect(new InvalidMaxEntriesError({ actual: -1 }).name).toBe("LruCacheInvalidMaxEntriesError");
  });

  test("meta に受け取った値を保持する", ({ expect }) => {
    // 実行と検証
    expect(new InvalidMaxEntriesError({ actual: 1.5 }).meta).toStrictEqual({ actual: 1.5 });
  });

  test("既定の英語メッセージを返す", ({ expect }) => {
    // 実行と検証
    expect(new InvalidMaxEntriesError({ actual: -1 }).message).toBe(
      "maxEntries must be an integer >= 0, but got -1",
    );
  });
});

describe("InvalidMaxBytesError", () => {
  test("name は LruCacheInvalidMaxBytesError である", ({ expect }) => {
    // 実行と検証
    expect(new InvalidMaxBytesError({ actual: -1 }).name).toBe("LruCacheInvalidMaxBytesError");
  });

  test("meta に受け取った値を保持する", ({ expect }) => {
    // 実行と検証
    expect(new InvalidMaxBytesError({ actual: "x" }).meta).toStrictEqual({ actual: "x" });
  });

  test("既定の英語メッセージを返す", ({ expect }) => {
    // 実行と検証
    expect(new InvalidMaxBytesError({ actual: -1 }).message).toBe(
      "maxBytes must be a finite number >= 0, but got -1",
    );
  });
});

describe("InvalidSizeOfResultError", () => {
  test("name は LruCacheInvalidSizeOfResultError である", ({ expect }) => {
    // 実行と検証
    expect(new InvalidSizeOfResultError({ key: "k1", actual: -1 }).name).toBe(
      "LruCacheInvalidSizeOfResultError",
    );
  });

  test("meta にキーと受け取った値を保持する", ({ expect }) => {
    // 実行と検証
    expect(new InvalidSizeOfResultError({ key: "k1", actual: -1 }).meta).toStrictEqual({
      key: "k1",
      actual: -1,
    });
  });

  test("既定の英語メッセージを返す", ({ expect }) => {
    // 実行と検証
    expect(new InvalidSizeOfResultError({ key: "k1", actual: -1 }).message).toBe(
      'sizeOf must return a finite number >= 0 for key "k1", but got -1',
    );
  });
});

describe("エラーの伝播", () => {
  test("ストリームの書き込みエラーは writer.closed へも伝播する", async ({ expect, storage }) => {
    // 準備
    const writer = storage
      .getWritable(createSetContext("s1") as IStorage.GetWritableContext)
      .getWriter();
    await captureRejection(writer.write("invalid" as unknown as Uint8Array<ArrayBuffer>));

    // 実行と検証
    await expect(writer.closed).rejects.toThrow(InvalidChunkTypeError);
    expect(storage.exists(createHasContext("s1") as IStorage.ExistsContext)).toBe(false);
  });
});
