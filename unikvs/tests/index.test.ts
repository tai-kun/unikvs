import { describe, test } from "vitest";

import {
  InvalidUsageErrorBase,
  InvalidInputError,
  InvalidOutputError,
  UniKvsIsOpenError,
  UniKvsIsNotOpenError,
  KeyNotFoundError,
  StorageIsNotOpenError,
  WritableStreamNotSupportedError,
  ReadableStreamNotSupportedError,
  TransformerIsNotOpenError,
  EncodableStreamNotSupportedError,
  DecodableStreamNotSupportedError,
  PluginOperationAggregateError,
  MissingStorageError,
} from "../src/errors.js";
import * as index from "../src/index.js";
import UniKvsConfig from "../src/unikvs-config.js";
import UniKvs from "../src/unikvs.js";

describe("index のエクスポート", () => {
  test("UniKvs がエクスポートされている", ({ expect }) => {
    expect(index.UniKvs).toBe(UniKvs);
  });

  test("UniKvsConfig がエクスポートされている", ({ expect }) => {
    expect(index.UniKvsConfig).toBe(UniKvsConfig);
  });

  test("エラークラスがエクスポートされている", ({ expect }) => {
    expect(index.InvalidUsageErrorBase).toBe(InvalidUsageErrorBase);
    expect(index.InvalidInputError).toBe(InvalidInputError);
    expect(index.InvalidOutputError).toBe(InvalidOutputError);
    expect(index.UniKvsIsOpenError).toBe(UniKvsIsOpenError);
    expect(index.UniKvsIsNotOpenError).toBe(UniKvsIsNotOpenError);
    expect(index.KeyNotFoundError).toBe(KeyNotFoundError);
    expect(index.StorageIsNotOpenError).toBe(StorageIsNotOpenError);
    expect(index.WritableStreamNotSupportedError).toBe(WritableStreamNotSupportedError);
    expect(index.ReadableStreamNotSupportedError).toBe(ReadableStreamNotSupportedError);
    expect(index.TransformerIsNotOpenError).toBe(TransformerIsNotOpenError);
    expect(index.EncodableStreamNotSupportedError).toBe(EncodableStreamNotSupportedError);
    expect(index.DecodableStreamNotSupportedError).toBe(DecodableStreamNotSupportedError);
    expect(index.PluginOperationAggregateError).toBe(PluginOperationAggregateError);
    expect(index.MissingStorageError).toBe(MissingStorageError);
  });
});
