import { test, describe, expectTypeOf } from "vite-plus/test";

// oxlint-disable import/no-namespace
import * as errors from "../src/errors.js";
import * as core from "../src/index.js";
import * as middlewareTypes from "../src/middleware.types.js";
import * as pipelineContext from "../src/pipeline-context.types.js";
import * as storage from "../src/storage.types.js";
import * as stream from "../src/stream.types.js";

describe("exports", () => {
  test("エントリーポイントは実行時の公開値をすべて再エクスポートする", ({ expect }) => {
    // 実行と検証：
    expect(Object.keys(core).sort()).toStrictEqual([
      "ErrorBase",
      "InvalidPartSizeError",
      "InvalidUsageErrorBase",
      "KeyNotFoundError",
      "ReadonlyVariableError",
      "RepairNotAllowedError",
      "StorageAbortedError",
      "UnsupportedRuntimeError",
      "setErrorMessage",
    ]);
  });

  test("エントリーポイントの実行時の値は errors モジュールと同一である", ({ expect }) => {
    // 実行と検証：
    expect(core.ErrorBase).toBe(errors.ErrorBase);
    expect(core.InvalidUsageErrorBase).toBe(errors.InvalidUsageErrorBase);
    expect(core.KeyNotFoundError).toBe(errors.KeyNotFoundError);
    expect(core.UnsupportedRuntimeError).toBe(errors.UnsupportedRuntimeError);
    expect(core.InvalidPartSizeError).toBe(errors.InvalidPartSizeError);
    expect(core.StorageAbortedError).toBe(errors.StorageAbortedError);
    expect(core.RepairNotAllowedError).toBe(errors.RepairNotAllowedError);
    expect(core.ReadonlyVariableError).toBe(errors.ReadonlyVariableError);
    expect(core.setErrorMessage).toBe(errors.setErrorMessage);
  });

  test("型のみのサブパスは実行時の値を公開しない", ({ expect }) => {
    // 実行と検証：
    expect(Object.keys(storage)).toStrictEqual([]);
    expect(Object.keys(middlewareTypes)).toStrictEqual([]);
    expect(Object.keys(pipelineContext)).toStrictEqual([]);
    expect(Object.keys(stream)).toStrictEqual([]);
  });

  test("storage の型はエントリーポイントから同一に解決される", () => {
    // 実行と検証：
    expectTypeOf<storage.IStorage>().toEqualTypeOf<core.IStorage>();
    expectTypeOf<storage.IWritableStreamStorage>().toEqualTypeOf<core.IWritableStreamStorage>();
    expectTypeOf<storage.IReadableStreamStorage>().toEqualTypeOf<core.IReadableStreamStorage>();
  });

  test("stream の型はエントリーポイントから同一に解決される", () => {
    // 実行と検証：
    expectTypeOf<stream.IReadableStream>().toEqualTypeOf<core.IReadableStream>();
    expectTypeOf<stream.IWritableStream>().toEqualTypeOf<core.IWritableStream>();
    expectTypeOf<stream.ITransformStream>().toEqualTypeOf<core.ITransformStream>();
  });

  test("middleware の型はエントリーポイントから同一に解決される", () => {
    // 実行と検証：
    expectTypeOf<middlewareTypes.IMiddleware>().toEqualTypeOf<core.IMiddleware>();
  });

  test("pipeline-context の型はエントリーポイントから同一に解決される", () => {
    // 実行と検証：
    expectTypeOf<pipelineContext.IPipelineContext>().toEqualTypeOf<core.IPipelineContext>();
    expectTypeOf<pipelineContext.IMapKeyContext>().toEqualTypeOf<core.IMapKeyContext>();
    expectTypeOf<pipelineContext.IActionContext>().toEqualTypeOf<core.IActionContext>();
    expectTypeOf<pipelineContext.ILifecycleContext>().toEqualTypeOf<core.ILifecycleContext>();
    expectTypeOf<pipelineContext.IOpenContext>().toEqualTypeOf<core.IOpenContext>();
    expectTypeOf<pipelineContext.ICloseContext>().toEqualTypeOf<core.ICloseContext>();
    expectTypeOf<pipelineContext.IKeyedActionContext>().toEqualTypeOf<core.IKeyedActionContext>();
    expectTypeOf<pipelineContext.ISetContext>().toEqualTypeOf<core.ISetContext>();
    expectTypeOf<pipelineContext.IGetContext>().toEqualTypeOf<core.IGetContext>();
    expectTypeOf<pipelineContext.IStreamContext>().toEqualTypeOf<core.IStreamContext>();
    expectTypeOf<pipelineContext.IHasContext>().toEqualTypeOf<core.IHasContext>();
    expectTypeOf<pipelineContext.IDeleteContext>().toEqualTypeOf<core.IDeleteContext>();
    expectTypeOf<pipelineContext.ITransferContext>().toEqualTypeOf<core.ITransferContext>();
    expectTypeOf<pipelineContext.ICopyContext>().toEqualTypeOf<core.ICopyContext>();
    expectTypeOf<pipelineContext.IMoveContext>().toEqualTypeOf<core.IMoveContext>();
    expectTypeOf<pipelineContext.IClearContext>().toEqualTypeOf<core.IClearContext>();
    expectTypeOf<pipelineContext.IEncodeContext>().toEqualTypeOf<core.IEncodeContext>();
    expectTypeOf<pipelineContext.IDecodeContext>().toEqualTypeOf<core.IDecodeContext>();
    expectTypeOf<pipelineContext.IEncodeStreamContext>().toEqualTypeOf<core.IEncodeStreamContext>();
    expectTypeOf<pipelineContext.IDecodeStreamContext>().toEqualTypeOf<core.IDecodeStreamContext>();
  });

  test("errors の型はエントリーポイントから同一に解決される", () => {
    // 実行と検証：
    expectTypeOf<core.ErrorMeta>().toEqualTypeOf<errors.ErrorMeta>();
    expectTypeOf<core.ErrorOptions>().toEqualTypeOf<errors.ErrorOptions>();
    expectTypeOf<core.KeyNotFoundErrorArgs>().toEqualTypeOf<errors.KeyNotFoundErrorArgs>();
    expectTypeOf<core.KeyNotFoundErrorMeta>().toEqualTypeOf<errors.KeyNotFoundErrorMeta>();
    expectTypeOf<core.StorageAbortedErrorArgs>().toEqualTypeOf<errors.StorageAbortedErrorArgs>();
    expectTypeOf<core.StorageAbortedErrorMeta>().toEqualTypeOf<errors.StorageAbortedErrorMeta>();
    expectTypeOf<core.InvalidPartSizeErrorArgs>().toEqualTypeOf<errors.InvalidPartSizeErrorArgs>();
    expectTypeOf<core.InvalidPartSizeErrorMeta>().toEqualTypeOf<errors.InvalidPartSizeErrorMeta>();
    expectTypeOf<core.ReadonlyVariableErrorArgs>().toEqualTypeOf<errors.ReadonlyVariableErrorArgs>();
    expectTypeOf<core.ReadonlyVariableErrorMeta>().toEqualTypeOf<errors.ReadonlyVariableErrorMeta>();
    expectTypeOf<core.RepairNotAllowedErrorArgs>().toEqualTypeOf<errors.RepairNotAllowedErrorArgs>();
    expectTypeOf<core.RepairNotAllowedErrorMeta>().toEqualTypeOf<errors.RepairNotAllowedErrorMeta>();
    expectTypeOf<core.UnsupportedRuntimeErrorArgs>().toEqualTypeOf<errors.UnsupportedRuntimeErrorArgs>();
    expectTypeOf<core.UnsupportedRuntimeErrorMeta>().toEqualTypeOf<errors.UnsupportedRuntimeErrorMeta>();
  });
});
