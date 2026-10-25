import { KeyNotFoundError as CoreKeyNotFoundError } from "@unikvs/core";
import { test, describe } from "vite-plus/test";

// oxlint-disable import/no-namespace
import {
  KeyNotFoundError,
  InvalidChunkTypeError,
  InvalidNamespaceError,
  InvalidMaxEntriesError,
  InvalidTtlSecondsError,
} from "../src/errors.js";
import * as index from "../src/index.js";
import VercelRuntimeCache from "../src/vercel-runtime-cache.js";

describe("index のエクスポート", () => {
  test("ストレージがエクスポートされている", ({ expect }) => {
    expect(index.VercelRuntimeCache).toBe(VercelRuntimeCache);
  });

  test("KeyNotFoundError は core のエラークラスを再エクスポートしている", ({ expect }) => {
    expect(index.KeyNotFoundError).toBe(CoreKeyNotFoundError);
  });

  test("エラークラスがエクスポートされている", ({ expect }) => {
    expect(index.KeyNotFoundError).toBe(KeyNotFoundError);
    expect(index.InvalidChunkTypeError).toBe(InvalidChunkTypeError);
    expect(index.InvalidTtlSecondsError).toBe(InvalidTtlSecondsError);
    expect(index.InvalidMaxEntriesError).toBe(InvalidMaxEntriesError);
    expect(index.InvalidNamespaceError).toBe(InvalidNamespaceError);
  });
});
