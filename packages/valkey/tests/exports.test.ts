import { Redis as Ioredis } from "ioredis";
import { describe, expectTypeOf, test } from "vitest";

import {
  CloseTimeoutError,
  ClusterNotSupportedError,
  ConnectTimeoutError,
  InvalidCloseTimeoutError,
  InvalidTtlError,
  KeyNotFoundError,
} from "../src/errors.js";
import type {
  ValkeyClient,
  ValkeyClusterSpec,
  ValkeyStorageOptions,
  InvalidCloseTimeoutErrorMeta,
  InvalidCloseTimeoutErrorArgs,
  InvalidTtlErrorMeta,
  InvalidTtlErrorArgs,
  ConnectTimeoutErrorMeta,
  ConnectTimeoutErrorArgs,
  CloseTimeoutErrorMeta,
  CloseTimeoutErrorArgs,
} from "../src/index.js";
import * as index from "../src/index.js";
import Valkey from "../src/valkey.js";

describe("index のエクスポート", () => {
  test("ストレージがエクスポートされている", ({ expect }) => {
    // 実行と検証
    expect(index.Valkey).toBe(Valkey);
  });

  test("エラークラスがエクスポートされている", ({ expect }) => {
    // 実行と検証
    expect(index.KeyNotFoundError).toBe(KeyNotFoundError);
  });

  test("UnsupportedRuntimeError は存在しない", ({ expect }) => {
    // 実行と検証
    // Node 専用のため、ランタイムガードのエラー型を持たない。
    expect(index).not.toHaveProperty("UnsupportedRuntimeError");
  });

  test("追加のエラークラスがエクスポートされている", ({ expect }) => {
    // 実行と検証
    expect(index.ClusterNotSupportedError).toBe(ClusterNotSupportedError);
    expect(index.InvalidCloseTimeoutError).toBe(InvalidCloseTimeoutError);
    expect(index.InvalidTtlError).toBe(InvalidTtlError);
    expect(index.ConnectTimeoutError).toBe(ConnectTimeoutError);
    expect(index.CloseTimeoutError).toBe(CloseTimeoutError);
  });

  test("型がエクスポートされている", () => {
    // 実行と検証
    // `index.js` から型を import できることで、`export type *` による再輸出を確認する。
    expectTypeOf<ValkeyStorageOptions>().toBeObject();
    expectTypeOf<ValkeyClusterSpec>().toBeObject();
    expectTypeOf<ValkeyClient>().toBeObject();
    expectTypeOf<InvalidCloseTimeoutErrorMeta>().toBeObject();
    expectTypeOf<InvalidCloseTimeoutErrorArgs>().toBeObject();
    expectTypeOf<InvalidTtlErrorMeta>().toBeObject();
    expectTypeOf<InvalidTtlErrorArgs>().toBeObject();
    expectTypeOf<ConnectTimeoutErrorMeta>().toBeObject();
    expectTypeOf<ConnectTimeoutErrorArgs>().toBeObject();
    expectTypeOf<CloseTimeoutErrorMeta>().toBeObject();
    expectTypeOf<CloseTimeoutErrorArgs>().toBeObject();
  });

  test("ioredis クライアントは ValkeyClient 形状を満たす", () => {
    // 実行と検証
    // 実クライアントを `client` オプションへ渡せることを型で保証する。
    // `lazyConnect` のため、この構築では接続しません。
    expectTypeOf(new Ioredis({ lazyConnect: true })).toMatchTypeOf<ValkeyClient>();
  });
});
