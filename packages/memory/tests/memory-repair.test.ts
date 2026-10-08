import { RepairNotAllowedError } from "@unikvs/core";
import { describe, test } from "vitest";

import Memory from "../src/memory.js";

describe("Memory - 書き戻しの許可", () => {
  test("既定では書き戻しを拒否する", ({ expect }) => {
    // 準備
    const storage = new Memory();

    // 実行と検証
    expect(storage.allowRepair).toBe(false);
    expect(() => storage.write({ key: "a", data: "x", vars: { "unikvs:repair": true } })).toThrow(
      RepairNotAllowedError,
    );
    expect(storage.exists({ key: "a" })).toBe(false);
  });

  test("allowRepair: true では書き戻しを受け付ける", ({ expect }) => {
    // 準備
    const storage = new Memory({ allowRepair: true });

    // 実行と検証
    expect(storage.allowRepair).toBe(true);
    storage.write({ key: "a", data: "x", vars: { "unikvs:repair": true } });
    expect(storage.read({ key: "a" })).toBe("x");
  });

  test("allowRepair: false では書き戻しの write を拒否する", ({ expect }) => {
    // 準備
    const storage = new Memory({ allowRepair: false });

    // 実行と検証
    expect(storage.allowRepair).toBe(false);
    expect(() => storage.write({ key: "a", data: "x", vars: { "unikvs:repair": true } })).toThrow(
      RepairNotAllowedError,
    );
    expect(storage.exists({ key: "a" })).toBe(false);
  });

  test("allowRepair: false でも通常の write は受け付ける", ({ expect }) => {
    // 準備
    const storage = new Memory({ allowRepair: false });

    // 実行と検証: 目印なしの書き込みは影響を受けない
    storage.write({ key: "a", data: "x", vars: {} });
    storage.write({ key: "b", data: "y", vars: {} });
    expect(storage.read({ key: "a" })).toBe("x");
    expect(storage.read({ key: "b" })).toBe("y");
  });

  test("allowRepair: false では書き戻しの getWritable を拒否する", ({ expect }) => {
    // 準備
    const storage = new Memory({ allowRepair: false });

    // 実行と検証
    expect(() => storage.getWritable({ key: "a", vars: { "unikvs:repair": true } })).toThrow(
      RepairNotAllowedError,
    );
    expect(storage.exists({ key: "a" })).toBe(false);
  });

  test("書き戻しを許可した getWritable は通常どおり書き込める", async ({ expect }) => {
    // 準備
    const storage = new Memory({ allowRepair: true });

    // 実行
    const writable = storage.getWritable({ key: "a", vars: { "unikvs:repair": true } });
    const writer = writable.getWriter();
    await writer.write(new Uint8Array([1, 2, 3]));
    await writer.close();

    // 検証
    expect(storage.exists({ key: "a" })).toBe(true);
  });
});
