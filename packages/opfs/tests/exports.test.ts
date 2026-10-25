// oxlint-disable import/no-namespace
import { test, describe } from "vite-plus/test";

import * as index from "../src/index.js";
import Opfs from "../src/opfs.js";

describe("index のエクスポート", () => {
  test("ストレージがエクスポートされている", ({ expect }) => {
    // 実行と検証：
    expect(index.Opfs).toBe(Opfs);
  });
});
