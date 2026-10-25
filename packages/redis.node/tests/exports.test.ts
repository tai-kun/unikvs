// oxlint-disable import/no-namespace
import { test, describe, expectTypeOf } from "vite-plus/test";

import {
  KeyNotFoundError,
  CloseTimeoutError,
  ConnectTimeoutError,
  ClusterNotSupportedError,
  InvalidCloseTimeoutError,
} from "../src/errors.js";
import type {
  RedisClusterSpec,
  RedisStorageOptions,
  CloseTimeoutErrorArgs,
  CloseTimeoutErrorMeta,
  ConnectTimeoutErrorArgs,
  ConnectTimeoutErrorMeta,
  InvalidCloseTimeoutErrorArgs,
  InvalidCloseTimeoutErrorMeta,
} from "../src/index.js";
import * as index from "../src/index.js";
import Redis from "../src/redis.js";

describe("index のエクスポート", () => {
  test("ストレージがエクスポートされている", ({ expect }) => {
    // 実行と検証：
    expect(index.Redis).toBe(Redis);
  });

  test("エラークラスがエクスポートされている", ({ expect }) => {
    // 実行と検証：
    expect(index.KeyNotFoundError).toBe(KeyNotFoundError);
  });

  test("UnsupportedRuntimeError は存在しない", ({ expect }) => {
    // 実行と検証：
    // `redis.bun` と異なり、Node 専用のためランタイムガードのエラー型を持たない。
    expect(index).not.toHaveProperty("UnsupportedRuntimeError");
  });

  test("追加のエラークラスがエクスポートされている", ({ expect }) => {
    // 実行と検証：
    expect(index.ClusterNotSupportedError).toBe(ClusterNotSupportedError);
    expect(index.InvalidCloseTimeoutError).toBe(InvalidCloseTimeoutError);
    expect(index.ConnectTimeoutError).toBe(ConnectTimeoutError);
    expect(index.CloseTimeoutError).toBe(CloseTimeoutError);
  });

  test("型がエクスポートされている", () => {
    // 実行と検証：
    // `index.js` から型を import できることで、`export type *` による再輸出を確認する。
    expectTypeOf<RedisStorageOptions>().toBeObject();
    expectTypeOf<RedisClusterSpec>().toBeObject();
    expectTypeOf<InvalidCloseTimeoutErrorMeta>().toBeObject();
    expectTypeOf<InvalidCloseTimeoutErrorArgs>().toBeObject();
    expectTypeOf<ConnectTimeoutErrorMeta>().toBeObject();
    expectTypeOf<ConnectTimeoutErrorArgs>().toBeObject();
    expectTypeOf<CloseTimeoutErrorMeta>().toBeObject();
    expectTypeOf<CloseTimeoutErrorArgs>().toBeObject();
  });
});
