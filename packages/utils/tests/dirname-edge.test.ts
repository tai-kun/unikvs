import { describe, test } from "vitest";

import isValidDirname from "../src/is-valid-dirname.js";

describe("isValidDirname", () => {
  test("ファイル名と同じ規則でディレクトリー名を検証する", ({ expect }) => {
    // 準備
    const cases: readonly (readonly [string, boolean])[] = [
      ["my-dir", true],
      ["サブディレクトリー", true],
      [".config", true],
      ["😀", true],
      ["", false],
      [".", false],
      ["..", false],
      ["dir/sub", false],
      ["dir\\sub", false],
      ["CON", false],
      ["name.", false],
      ["name ", false],
      ["foo:bar", false],
      ["e\u0301", false],
    ];

    // 実行と検証
    for (const [input, expected] of cases) {
      expect(isValidDirname(input), input).toBe(expected);
    }
  });
});
