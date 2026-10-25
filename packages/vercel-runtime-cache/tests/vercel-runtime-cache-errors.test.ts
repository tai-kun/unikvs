import { test, describe } from "vite-plus/test";

import {
  InvalidChunkTypeError,
  InvalidNamespaceError,
  InvalidMaxEntriesError,
  InvalidTtlSecondsError,
} from "../src/errors.js";

describe("InvalidChunkTypeError", () => {
  test("name は VercelRuntimeCacheInvalidChunkTypeError である", ({ expect }) => {
    expect(
      new InvalidChunkTypeError({
        key: "k1",
        chunk: "x",
      }).name,
    ).toBe("VercelRuntimeCacheInvalidChunkTypeError");
  });

  test("チャンクと型名を meta に保持する", ({ expect }) => {
    const chunk = { invalid: true };
    const error = new InvalidChunkTypeError({
      key: "k1",
      chunk,
    });
    expect(error.meta.key).toBe("k1");
    expect(error.meta.chunk).toBe(chunk);
    expect(error.meta.chunkType).toBe("Object");
  });

  test("既定の英語メッセージを返す", ({ expect }) => {
    expect(
      new InvalidChunkTypeError({
        key: "k1",
        chunk: "x",
      }).message,
    ).toBe('Expected chunk for key "k1" is Uint8Array<ArrayBuffer>, but got string');
  });
});

describe("InvalidTtlSecondsError", () => {
  test("name は VercelRuntimeCacheInvalidTtlSecondsError である", ({ expect }) => {
    expect(new InvalidTtlSecondsError({ actual: 0 }).name).toBe(
      "VercelRuntimeCacheInvalidTtlSecondsError",
    );
  });

  test("meta に実際の値を保持する", ({ expect }) => {
    expect(new InvalidTtlSecondsError({ actual: -1 }).meta).toStrictEqual({ actual: -1 });
  });

  test("既定の英語メッセージを返す", ({ expect }) => {
    expect(new InvalidTtlSecondsError({ actual: 0 }).message).toBe(
      "ttlSeconds must be a finite number > 0, but got 0",
    );
  });
});

describe("InvalidMaxEntriesError", () => {
  test("name は VercelRuntimeCacheInvalidMaxEntriesError である", ({ expect }) => {
    expect(new InvalidMaxEntriesError({ actual: -1 }).name).toBe(
      "VercelRuntimeCacheInvalidMaxEntriesError",
    );
  });

  test("meta に実際の値を保持する", ({ expect }) => {
    expect(new InvalidMaxEntriesError({ actual: 1.5 }).meta).toStrictEqual({ actual: 1.5 });
  });

  test("既定の英語メッセージを返す", ({ expect }) => {
    expect(new InvalidMaxEntriesError({ actual: -1 }).message).toBe(
      "maxEntries must be an integer >= 0, but got -1",
    );
  });
});

describe("InvalidNamespaceError", () => {
  test("name は VercelRuntimeCacheInvalidNamespaceError である", ({ expect }) => {
    expect(new InvalidNamespaceError({ actual: 123 }).name).toBe(
      "VercelRuntimeCacheInvalidNamespaceError",
    );
  });

  test("meta に実際の値を保持する", ({ expect }) => {
    expect(new InvalidNamespaceError({ actual: 123 }).meta).toStrictEqual({ actual: 123 });
  });

  test("既定の英語メッセージを返す", ({ expect }) => {
    expect(new InvalidNamespaceError({ actual: 123 }).message).toBe(
      "namespace must be a string, but got 123",
    );
  });
});
