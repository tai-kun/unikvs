// oxlint-disable import/no-namespace
import { test, describe } from "vite-plus/test";

import { HexDecodeError } from "../src/errors.js";
import Hex from "../src/hex.js";
import * as index from "../src/index.js";

describe("index のエクスポート", () => {
  test("トランスフォーマーとエラーがエクスポートされている", ({ expect }) => {
    // 実行と検証：
    expect(index.Hex).toBe(Hex);
    expect(index.HexDecodeError).toBe(HexDecodeError);
  });
});
