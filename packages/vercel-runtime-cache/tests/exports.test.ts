import { describe, test } from "vitest";

import {
  InvalidChunkTypeError,
  InvalidMaxEntriesError,
  InvalidNamespaceError,
  InvalidTtlSecondsError,
  KeyNotFoundError,
} from "../src/errors.js";
import * as index from "../src/index.js";
import VercelRuntimeCache from "../src/vercel-runtime-cache.js";

describe("index のエクスポート", () => {
  test("ストレージがエクスポートされている", ({ expect }) => {
    expect(index.VercelRuntimeCache).toBe(VercelRuntimeCache);
  });

  test("エラークラスがエクスポートされている", ({ expect }) => {
    expect(index.KeyNotFoundError).toBe(KeyNotFoundError);
    expect(index.InvalidChunkTypeError).toBe(InvalidChunkTypeError);
    expect(index.InvalidTtlSecondsError).toBe(InvalidTtlSecondsError);
    expect(index.InvalidMaxEntriesError).toBe(InvalidMaxEntriesError);
    expect(index.InvalidNamespaceError).toBe(InvalidNamespaceError);
  });
});
