import { describe, test } from "vitest";

import * as index from "../src/index.js";
import Indexeddb from "../src/indexeddb.js";

describe("index のエクスポート", () => {
  test("ストレージがエクスポートされている", ({ expect }) => {
    // 実行と検証
    expect(index.Indexeddb).toBe(Indexeddb);
  });
});
