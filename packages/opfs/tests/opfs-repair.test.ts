import { RepairNotAllowedError } from "@unikvs/core";
import { describe } from "vitest";

import Opfs from "../src/opfs.js";
import { test } from "./_helpers.js";

const { signal } = new AbortController();

describe("Opfs - 書き戻しの許可", () => {
  test("既定では書き戻しを拒否する", async ({ expect, root }) => {
    // 準備
    const storage = new Opfs(root);
    await storage.open({ signal });

    // 実行
    const error = await storage
      .write({
        key: "a.bin",
        data: new Uint8Array([1]),
        signal,
        vars: { "unikvs:repair": true },
      })
      .catch((ex: unknown) => ex);

    // 検証
    expect(storage.allowRepair).toBe(false);
    expect(error).toBeInstanceOf(RepairNotAllowedError);
    expect(await storage.exists({ key: "a.bin", signal })).toBe(false);
  });

  test("allowRepair: true では書き戻しを受け付ける", async ({ expect, root }) => {
    // 準備
    const storage = new Opfs(root, { allowRepair: true });
    await storage.open({ signal });

    // 実行と検証
    expect(storage.allowRepair).toBe(true);
    await storage.write({
      key: "a.bin",
      data: new Uint8Array([1]),
      signal,
      vars: { "unikvs:repair": true },
    });
    expect(await storage.read({ key: "a.bin", signal })).toStrictEqual(new Uint8Array([1]));
  });

  test("allowRepair: false では書き戻しの write を拒否する", async ({ expect, root }) => {
    // 準備
    const storage = new Opfs(root, { allowRepair: false });
    await storage.open({ signal });

    // 実行
    const error = await storage
      .write({
        key: "a.bin",
        data: new Uint8Array([1]),
        signal,
        vars: { "unikvs:repair": true },
      })
      .catch((ex: unknown) => ex);

    // 検証
    expect(storage.allowRepair).toBe(false);
    expect(error).toBeInstanceOf(RepairNotAllowedError);
    expect(await storage.exists({ key: "a.bin", signal })).toBe(false);
  });

  test("allowRepair: false でも通常の write は受け付ける", async ({ expect, root }) => {
    // 準備
    const storage = new Opfs(root, { allowRepair: false });
    await storage.open({ signal });

    // 実行と検証: 目印なしの書き込みは影響を受けない
    await storage.write({ key: "a.bin", data: new Uint8Array([1]), signal, vars: {} });
    await storage.write({ key: "b.bin", data: new Uint8Array([2]), signal, vars: {} });
    expect(await storage.read({ key: "a.bin", signal })).toStrictEqual(new Uint8Array([1]));
    expect(await storage.read({ key: "b.bin", signal })).toStrictEqual(new Uint8Array([2]));
  });

  test("allowRepair: false では書き戻しの getWritable を拒否する", async ({ expect, root }) => {
    // 準備
    const storage = new Opfs(root, { allowRepair: false });
    await storage.open({ signal });

    // 実行
    const error = await storage
      .getWritable({ key: "a.bin", signal, vars: { "unikvs:repair": true } })
      .catch((ex: unknown) => ex);

    // 検証
    expect(error).toBeInstanceOf(RepairNotAllowedError);
    expect(await storage.exists({ key: "a.bin", signal })).toBe(false);
  });

  test("書き戻しを許可した getWritable は通常どおり書き込める", async ({ expect, root }) => {
    // 準備
    const storage = new Opfs(root, { allowRepair: true });
    await storage.open({ signal });

    // 実行
    const writable = await storage.getWritable({
      key: "a.bin",
      signal,
      vars: { "unikvs:repair": true },
    });
    const writer = writable.getWriter();
    await writer.write(new Uint8Array([1, 2, 3]));
    await writer.close();

    // 検証
    expect(await storage.exists({ key: "a.bin", signal })).toBe(true);
    expect(await storage.read({ key: "a.bin", signal })).toStrictEqual(new Uint8Array([1, 2, 3]));
  });
});
