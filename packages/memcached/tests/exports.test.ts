import { describe, expectTypeOf, test } from "vitest";

import {
  ConnectTimeoutError,
  InvalidConnectTimeoutError,
  InvalidTtlSecondsError,
  KeyNotFoundError,
} from "../src/errors.js";
import type {
  ConnectTimeoutErrorMeta,
  ConnectTimeoutErrorArgs,
  InvalidConnectTimeoutErrorMeta,
  InvalidConnectTimeoutErrorArgs,
  InvalidTtlSecondsErrorMeta,
  InvalidTtlSecondsErrorArgs,
  MemcachedClientLike,
  MemcachedGetResultValue,
  MemcachedServers,
  MemcachedStorageOptions,
} from "../src/index.js";
import * as index from "../src/index.js";
import Memcached from "../src/memcached.js";

describe("index のエクスポート", () => {
  test("ストレージがエクスポートされている", ({ expect }) => {
    // 実行と検証
    expect(index.Memcached).toBe(Memcached);
  });

  test("エラークラスがエクスポートされている", ({ expect }) => {
    // 実行と検証
    expect(index.KeyNotFoundError).toBe(KeyNotFoundError);
  });

  test("UnsupportedRuntimeError は存在しない", ({ expect }) => {
    // 実行と検証
    expect(index).not.toHaveProperty("UnsupportedRuntimeError");
  });

  test("close 系のエラー型は存在しない", ({ expect }) => {
    // 実行と検証
    // memcached クライアントの解放は同期的でタイムアウトしないため、close 系のエラー型を持たない。
    expect(index).not.toHaveProperty("CloseTimeoutError");
    expect(index).not.toHaveProperty("InvalidCloseTimeoutError");
  });

  test("追加のエラークラスがエクスポートされている", ({ expect }) => {
    // 実行と検証
    expect(index.InvalidTtlSecondsError).toBe(InvalidTtlSecondsError);
    expect(index.InvalidConnectTimeoutError).toBe(InvalidConnectTimeoutError);
    expect(index.ConnectTimeoutError).toBe(ConnectTimeoutError);
  });

  test("型がエクスポートされている", () => {
    // 実行と検証
    // `index.js` から型を import できることで、`export type *` による再輸出を確認する。
    expectTypeOf<MemcachedClientLike>().toBeObject();
    expectTypeOf<MemcachedGetResultValue>().toEqualTypeOf<Uint8Array | string | null | undefined>();
    expectTypeOf<MemcachedServers>().toEqualTypeOf<string | readonly string[]>();
    expectTypeOf<MemcachedStorageOptions>().toBeObject();
    expectTypeOf<InvalidTtlSecondsErrorMeta>().toBeObject();
    expectTypeOf<InvalidTtlSecondsErrorArgs>().toBeObject();
    expectTypeOf<InvalidConnectTimeoutErrorMeta>().toBeObject();
    expectTypeOf<InvalidConnectTimeoutErrorArgs>().toBeObject();
    expectTypeOf<ConnectTimeoutErrorMeta>().toBeObject();
    expectTypeOf<ConnectTimeoutErrorArgs>().toBeObject();
  });
});
