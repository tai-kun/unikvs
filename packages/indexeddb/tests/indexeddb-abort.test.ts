import { describe } from "vitest";

import { test } from "./_helpers.js";

describe("AbortSignal による中断", () => {
  test("中断済みの signal はすべてのメソッドを中断理由で拒否する", async ({ expect, storage }) => {
    // 準備
    const key = "pre-aborted";
    await storage.open();
    await storage.write({ key, data: "value" });
    const controller = new AbortController();
    const reason = new Error("独自の中断理由");
    controller.abort(reason);
    const { signal } = controller;

    // 実行と検証
    await expect(storage.write({ key, data: "next", signal })).rejects.toBe(reason);
    await expect(storage.read({ key, signal })).rejects.toBe(reason);
    await expect(storage.exists({ key, signal })).rejects.toBe(reason);
    await expect(storage.delete({ key, signal })).rejects.toBe(reason);
    await expect(storage.clear({ signal })).rejects.toBe(reason);
    await expect(storage.close({ signal })).rejects.toBe(reason);
    expect(() => storage.getWritable({ key, signal })).toThrow(reason);
    expect(() => storage.getReadable({ key, signal })).toThrow(reason);
    expect(storage.isOpen).toBe(true);
  });

  test("中断済みの signal は open を中断理由で拒否する", async ({ expect, storage }) => {
    // 準備
    const controller = new AbortController();
    const reason = new Error("独自の中断理由");
    controller.abort(reason);

    // 実行と検証
    await expect(storage.open({ signal: controller.signal })).rejects.toBe(reason);
    expect(storage.isOpen).toBe(false);
  });

  test("実行中に中断された open は未オープンのままにする", async ({ expect, storage }) => {
    // 準備
    const controller = new AbortController();
    const reason = new Error("テスト用の中断");

    // 実行
    const opening = storage.open({ signal: controller.signal });
    controller.abort(reason);

    // 検証
    await expect(opening).rejects.toBe(reason);
    expect(storage.isOpen).toBe(false);
  });

  test("実行中に中断された read は中断理由で拒否される", async ({ expect, storage }) => {
    // 準備
    await storage.open();
    const key = "aborted-read";
    await storage.write({ key, data: new Uint8Array([1, 2, 3]) });
    const controller = new AbortController();
    const reason = new Error("テスト用の中断");

    // 実行
    const reading = storage.read({ key, signal: controller.signal });
    controller.abort(reason);

    // 検証
    await expect(reading).rejects.toBe(reason);
  });

  test("書き込みストリームを signal で中断したとき、保存されない", async ({ expect, storage }) => {
    // 準備
    await storage.open();
    const key = "aborted-writable";
    const controller = new AbortController();
    const reason = new Error("テスト用の中断");
    const writer = storage.getWritable({ key, signal: controller.signal }).getWriter();
    await writer.write(new Uint8Array([1, 2, 3]));

    // 実行
    controller.abort(reason);

    // 検証
    await expect(writer.close()).rejects.toBe(reason);
    expect(await storage.exists({ key })).toBe(false);
  });

  test("読み取りストリームを signal で中断したとき、読み取りが中断理由で失敗する", async ({
    expect,
    storage,
  }) => {
    // 準備
    await storage.open();
    const key = "aborted-readable";
    await storage.write({ key, data: new Uint8Array([1, 2, 3]) });
    const controller = new AbortController();
    const reason = new Error("テスト用の中断");
    const reader = storage.getReadable({ key, signal: controller.signal }).getReader();

    // 実行
    controller.abort(reason);

    // 検証
    await expect(reader.read()).rejects.toBe(reason);
  });
});
