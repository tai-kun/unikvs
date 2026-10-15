import { describe, test } from "vitest";

import { KeyPrefixClearDeniedError } from "../src/errors.js";
import * as index from "../src/index.js";
import KeyPrefix from "../src/key-prefix.js";

describe("index のエクスポート", () => {
  test("トランスフォーマーがエクスポートされている", ({ expect }) => {
    // 実行と検証
    expect(index.KeyPrefix).toBe(KeyPrefix);
  });

  test("エラークラスがエクスポートされている", ({ expect }) => {
    // 実行と検証
    expect(index.KeyPrefixClearDeniedError).toBe(KeyPrefixClearDeniedError);
  });
});
