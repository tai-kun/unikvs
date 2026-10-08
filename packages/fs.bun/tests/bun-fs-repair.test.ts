import { RepairNotAllowedError } from "@unikvs/core";
import { describe } from "vitest";

import BunFs from "../src/bun-fs.js";
import { test } from "./_helpers.js";

describe("BunFs - 書き戻しの許可", () => {
  test("既定では書き戻しを拒否する", async ({ expect, root, signal }) => {
    // 準備
    const storage = new BunFs(root);
    await storage.open();

    // 実行と検証
    expect(storage.allowRepair).toBe(false);
    await expect(
      storage.write({
        key: "a",
        data: new Uint8Array([1, 2, 3]),
        signal,
        vars: { "unikvs:repair": true },
      }),
    ).rejects.toThrow(RepairNotAllowedError);
    expect(await storage.exists({ key: "a" })).toBe(false);
  });

  test("allowRepair: true では書き戻しを受け付ける", async ({ expect, root, signal }) => {
    // 準備
    const storage = new BunFs(root, { allowRepair: true });
    await storage.open();

    // 実行と検証
    expect(storage.allowRepair).toBe(true);
    const data = new Uint8Array([1, 2, 3]);
    await storage.write({ key: "a", data, signal, vars: { "unikvs:repair": true } });
    expect(new Uint8Array(await storage.read({ key: "a", signal }))).toStrictEqual(data);
  });

  test("allowRepair: false では書き戻しの write を拒否する", async ({ expect, root, signal }) => {
    // 準備
    const storage = new BunFs(root, { allowRepair: false });
    await storage.open();

    // 実行と検証
    expect(storage.allowRepair).toBe(false);
    await expect(
      storage.write({
        key: "a",
        data: new Uint8Array([1, 2, 3]),
        signal,
        vars: { "unikvs:repair": true },
      }),
    ).rejects.toThrow(RepairNotAllowedError);
    expect(await storage.exists({ key: "a" })).toBe(false);
  });

  test("allowRepair: false でも通常の write は受け付ける", async ({ expect, root, signal }) => {
    // 準備
    const storage = new BunFs(root, { allowRepair: false });
    await storage.open();

    // 実行: 目印なしの書き込みは影響を受けない
    const dataA = new Uint8Array([1, 2, 3]);
    const dataB = new Uint8Array([4, 5, 6]);
    await storage.write({ key: "a", data: dataA, signal, vars: {} });
    await storage.write({ key: "b", data: dataB, signal, vars: {} });

    // 検証
    expect(new Uint8Array(await storage.read({ key: "a", signal }))).toStrictEqual(dataA);
    expect(new Uint8Array(await storage.read({ key: "b", signal }))).toStrictEqual(dataB);
  });

  test("allowRepair: false では書き戻しの getWritable を拒否する", async ({
    expect,
    root,
    signal,
  }) => {
    // 準備
    const storage = new BunFs(root, { allowRepair: false });
    await storage.open();

    // 実行と検証
    await expect(
      storage.getWritable({ key: "a", signal, vars: { "unikvs:repair": true } }),
    ).rejects.toThrow(RepairNotAllowedError);
    expect(await storage.exists({ key: "a" })).toBe(false);
  });

  test("書き戻しを許可した getWritable は通常どおり書き込める", async ({
    expect,
    root,
    signal,
  }) => {
    // 準備
    const storage = new BunFs(root, { allowRepair: true });
    await storage.open();

    // 実行
    const writable = await storage.getWritable({
      key: "a",
      signal,
      vars: { "unikvs:repair": true },
    });
    const writer = writable.getWriter();
    await writer.write(new Uint8Array([1, 2, 3]));
    await writer.close();

    // 検証
    expect(await storage.exists({ key: "a" })).toBe(true);
  });
});
