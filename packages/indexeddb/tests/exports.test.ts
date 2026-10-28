// oxlint-disable import/no-namespace
import { test, describe } from "vite-plus/test";

import { InvalidChunkTypeError } from "../src/errors.js";
import * as index from "../src/index.js";
import Indexeddb from "../src/indexeddb.js";

describe("index のエクスポート", () => {
  test("ストレージがエクスポートされている", ({ expect }) => {
    // 実行と検証：
    expect(index.Indexeddb).toBe(Indexeddb);
  });

  test("エラーがエクスポートされている", ({ expect }) => {
    // 実行と検証：
    expect(index.InvalidChunkTypeError).toBe(InvalidChunkTypeError);
  });
});
