// oxlint-disable import/no-namespace
import { test, describe, expectTypeOf } from "vite-plus/test";

import { KeyNotFoundError, InvalidLeaseTtlError, InvalidEndpointsError } from "../src/errors.js";
import Etcd, { wrapNativeEtcdClient } from "../src/etcd.js";
import type {
  EtcdClientLike,
  EtcdPutOptions,
  EtcdGetAllResult,
  EtcdStorageOptions,
  KeyNotFoundErrorArgs,
  KeyNotFoundErrorMeta,
  NativeEtcdClientLike,
  InvalidLeaseTtlErrorArgs,
  InvalidLeaseTtlErrorMeta,
  InvalidEndpointsErrorArgs,
  InvalidEndpointsErrorMeta,
} from "../src/index.js";
import * as index from "../src/index.js";

describe("index のエクスポート", () => {
  test("ストレージがエクスポートされている", ({ expect }) => {
    expect(index.Etcd).toBe(Etcd);
  });

  test("適合ヘルパーがエクスポートされている", ({ expect }) => {
    expect(index.wrapNativeEtcdClient).toBe(wrapNativeEtcdClient);
  });

  test("エラークラスがエクスポートされている", ({ expect }) => {
    expect(index.KeyNotFoundError).toBe(KeyNotFoundError);
    expect(index.InvalidLeaseTtlError).toBe(InvalidLeaseTtlError);
    expect(index.InvalidEndpointsError).toBe(InvalidEndpointsError);
  });

  test("型がエクスポートされている", () => {
    expectTypeOf<EtcdStorageOptions>().toBeObject();
    expectTypeOf<EtcdClientLike>().toBeObject();
    expectTypeOf<EtcdPutOptions>().toBeObject();
    expectTypeOf<EtcdGetAllResult>().toBeObject();
    expectTypeOf<NativeEtcdClientLike>().toBeObject();
    expectTypeOf<InvalidLeaseTtlErrorMeta>().toBeObject();
    expectTypeOf<InvalidLeaseTtlErrorArgs>().toBeObject();
    expectTypeOf<InvalidEndpointsErrorMeta>().toBeObject();
    expectTypeOf<InvalidEndpointsErrorArgs>().toBeObject();
    expectTypeOf<KeyNotFoundErrorMeta>().toBeObject();
    expectTypeOf<KeyNotFoundErrorArgs>().toBeObject();
  });
});
