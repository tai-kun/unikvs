// oxlint-disable import/no-namespace
import { test, describe } from "vite-plus/test";

import {
  InvalidForkError,
  KeyNotFoundError,
  InvalidInputError,
  UniKvsIsOpenError,
  InvalidOutputError,
  MissingStorageError,
  UniKvsIsNotOpenError,
  InvalidUsageErrorBase,
  StorageIsNotOpenError,
  MiddlewareIsNotOpenError,
  UnterminatedPipelineError,
  PluginOperationAggregateError,
  ReadableStreamNotSupportedError,
  StreamDecodingNotSupportedError,
  StreamEncodingNotSupportedError,
  WritableStreamNotSupportedError,
} from "../src/errors.js";
import * as index from "../src/index.js";
import UniKvsBranch from "../src/unikvs-branch.js";
import UniKvsBuilder from "../src/unikvs-builder.js";
import UniKvs from "../src/unikvs.js";

describe("index のエクスポート", () => {
  test("UniKvs がエクスポートされている", ({ expect }) => {
    expect(index.UniKvs).toBe(UniKvs);
  });

  test("Builder がエクスポートされている", ({ expect }) => {
    expect(index.Builder).toBe(UniKvsBuilder);
    expect(index.UniKvsBuilder).toBe(UniKvsBuilder);
  });

  test("Branch がエクスポートされている", ({ expect }) => {
    expect(index.Branch).toBe(UniKvsBranch);
    expect(index.UniKvsBranch).toBe(UniKvsBranch);
  });

  test("値のスキーマ定義がエクスポートされている", ({ expect }) => {
    expect(index.PlainValue).toBeTypeOf("function");
    expect(index.StreamValue).toBeTypeOf("function");
    expect(index.Value).toBeTypeOf("function");
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
    expect(index.MiddlewareIsNotOpenError).toBe(MiddlewareIsNotOpenError);
    expect(index.StreamEncodingNotSupportedError).toBe(StreamEncodingNotSupportedError);
    expect(index.StreamDecodingNotSupportedError).toBe(StreamDecodingNotSupportedError);
    expect(index.PluginOperationAggregateError).toBe(PluginOperationAggregateError);
    expect(index.InvalidForkError).toBe(InvalidForkError);
    expect(index.MissingStorageError).toBe(MissingStorageError);
    expect(index.UnterminatedPipelineError).toBe(UnterminatedPipelineError);
  });
});
