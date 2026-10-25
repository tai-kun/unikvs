import { test, describe } from "vite-plus/test";

// oxlint-disable import/no-namespace
import AllowRepair from "../src/allow-repair.js";
import * as index from "../src/index.js";

describe("index のエクスポート", () => {
  test("トランスフォーマーがエクスポートされている", ({ expect }) => {
    // 実行と検証：
    expect(index.AllowRepair).toBe(AllowRepair);
  });

  test("AllowRepair のみをエクスポートしている", ({ expect }) => {
    // 実行と検証：
    expect(Object.keys(index)).toStrictEqual(["AllowRepair"]);
  });
});
