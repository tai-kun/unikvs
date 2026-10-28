import type { IStorage } from "@unikvs/core";
import {
  captureThrown,
  createGetContext,
  createHasContext,
  createSetContext,
} from "@unikvs/testing";
import { test as vitest, describe } from "vite-plus/test";

import Cookies from "../src/cookies.js";
import { CookieTooLargeError } from "../src/errors.js";
import { createFakeCookieStore } from "./_helpers.js";

const { signal } = new AbortController();

const test = vitest.extend<{ storage: Cookies }>({
  async storage({}, use) {
    await use(new Cookies({ store: createFakeCookieStore() }));
  },
});
describe("4KB 制限", () => {
  test("上限を超える文字列の write は CookieTooLargeError を投げる", ({ expect, storage }) => {
    // 実行：
    const error = captureThrown(() => {
      storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "a".repeat(4097));
    });

    // 検証：
    expect(error).toBeInstanceOf(CookieTooLargeError);
  });

  test("上限を超えるバイト列の write は CookieTooLargeError を投げる", ({ expect, storage }) => {
    // 実行：
    const error = captureThrown(() => {
      storage.write(
        createSetContext("k1", { signal }) as IStorage.WriteContext,
        new Uint8Array(4097),
      );
    }) as CookieTooLargeError;

    // 検証：
    expect(error).toBeInstanceOf(CookieTooLargeError);
    expect(error.meta.actual).toBe(4097);
    expect(error.meta.measurement).toBe("raw");
  });

  test("生サイズとシリアル化後のサイズが上限内の値は書き込める", ({ expect, storage }) => {
    // 実行：
    storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "a".repeat(3000));
    storage.write(
      createSetContext("k2", { signal }) as IStorage.WriteContext,
      new Uint8Array(3000),
    );

    // 検証：
    expect(storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext)).toBe(
      "a".repeat(3000),
    );
    expect(storage.read(createGetContext("k2", { signal }) as IStorage.ReadContext)).toEqual(
      new Uint8Array(3000),
    );
  });

  test("エラーはキー・実測・上限の内訳を持つ", ({ expect, storage }) => {
    // 実行：
    const error = captureThrown(() => {
      storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "a".repeat(5000));
    }) as CookieTooLargeError;

    // 検証：
    expect(error.meta.key).toBe("k1");
    expect(error.meta.actual).toBe(5000);
    expect(error.meta.limit).toBe(4096);
    expect(error.meta.measurement).toBe("raw");
  });

  test("sizeLimitBytes で上限を変えられる", ({ expect }) => {
    // 準備：
    const storage = new Cookies({
      store: createFakeCookieStore(),
      sizeLimitBytes: 128,
    });

    // 検証：
    expect(storage.sizeLimitBytes).toBe(128);
    expect(() => {
      storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "a".repeat(129));
    }).toThrow(CookieTooLargeError);
    storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "hey");
    expect(storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext)).toBe("hey");
  });

  test("文字数の上限ではなく UTF-8 のバイト数で生サイズを判定する", ({ expect }) => {
    // 準備：
    const storage = new Cookies({
      store: createFakeCookieStore(),
      sizeLimitBytes: 4,
    });

    // 実行：
    const error = captureThrown(() => {
      storage.write(createSetContext("k2", { signal }) as IStorage.WriteContext, "ああ");
    }) as CookieTooLargeError;

    // 検証：
    expect(error).toBeInstanceOf(CookieTooLargeError);
    expect(error.meta.actual).toBe(6);
    expect(error.meta.limit).toBe(4);
    expect(error.meta.measurement).toBe("raw");
  });

  test("生サイズが上限内でもシリアル化後のサイズが上限を超える場合は拒否する", ({ expect }) => {
    // 準備：
    const store = createFakeCookieStore();
    const storage = new Cookies({
      store,
      sizeLimitBytes: 128,
      cookieAttributes: { path: "/" },
    });

    // 実行：
    const error = captureThrown(() => {
      storage.write(
        createSetContext("a".repeat(40), { signal }) as IStorage.WriteContext,
        "あ".repeat(10),
      );
    }) as CookieTooLargeError;

    // 検証：
    expect(error).toBeInstanceOf(CookieTooLargeError);
    expect(error.meta.actual).toBe(143);
    expect(error.meta.measurement).toBe("serialized");
    expect(store.setCalls).toHaveLength(0);
  });

  test("シリアル化後のサイズが上限ちょうどなら受け入れ、1 バイト超過なら拒否する", ({ expect }) => {
    // 準備：
    const store = createFakeCookieStore();
    const storage = new Cookies({
      store,
      sizeLimitBytes: 128,
      cookieAttributes: { path: "/" },
    });
    const key = "a".repeat(40);

    // 実行：
    storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, "a".repeat(75));

    const error = captureThrown(() => {
      storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, "a".repeat(76));
    }) as CookieTooLargeError;

    // 検証：
    expect(storage.read(createGetContext(key, { signal }) as IStorage.ReadContext)).toBe(
      "a".repeat(75),
    );
    expect(error).toBeInstanceOf(CookieTooLargeError);
    expect(error.meta.actual).toBe(129);
    expect(error.meta.limit).toBe(128);
    expect(error.meta.measurement).toBe("serialized");
    expect(store.setCalls).toHaveLength(1);
  });

  test("生のキーが空の場合は拒否する", ({ expect }) => {
    // 準備：
    const store = createFakeCookieStore();
    const storage = new Cookies({ store });

    // 実行と検証：
    expect(() => {
      storage.write(createSetContext("", { signal }) as IStorage.WriteContext, "v");
    }).toThrow(TypeError);
    expect(store.setCalls).toHaveLength(0);
  });

  test("上限超過で失敗した write は既存値を壊さない", ({ expect, storage }) => {
    // 準備：
    storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");

    // 実行：
    captureThrown(() => {
      storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "a".repeat(5000));
    });

    // 検証：
    expect(storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext)).toBe("v1");
  });

  test("上限超過で失敗した新規キーは存在しない", ({ expect, storage }) => {
    // 実行：
    captureThrown(() => {
      storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "a".repeat(5000));
    });

    // 検証：
    expect(storage.exists(createHasContext("k1", { signal }) as IStorage.ExistsContext)).toBe(
      false,
    );
  });
});
