import { describe, test } from "vitest";

import Cbor from "../src/cbor.js";
import { CborDecodeError, CborEncodeError } from "../src/errors.js";
import * as index from "../src/index.js";

describe("index のエクスポート", () => {
  test("トランスフォーマーとエラーがエクスポートされている", ({ expect }) => {
    // 実行と検証
    expect(index.Cbor).toBe(Cbor);
    expect(index.CborEncodeError).toBe(CborEncodeError);
    expect(index.CborDecodeError).toBe(CborDecodeError);
  });
});
